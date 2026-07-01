import { Router } from 'express';
import OpenAI from 'openai';
import { audit } from '../security.js';
import { getBiometricContext } from '../clinical-context.js';

const router = Router();

// Initialize OpenAI — uses OPENAI_API_KEY env var
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || '',
});

// ── Clinical System Prompt ────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are VEEDA Clinical Decision Support Agent — an AI clinical assistant trained on NHS Early Warning Score (NEWS2) and qSOFA protocols.

YOUR ROLE:
- You are a Clinical Decision Support Agent, NOT a wellness coach.
- You MUST reference calculated NEWS2 and qSOFA scores when discussing patient vitals.
- Use definitive clinical terminology. Do NOT use casual wellness colloquialisms like "Listen to your body!" or "Stay hydrated!".
- Append standard NHS escalation logic based on risk scores (e.g., "A NEWS2 score of 5 constitutes an urgent trigger threshold requiring clinical review within 60 minutes").
- If the user reports symptoms that match emergency warning signs (chest pain, severe difficulty breathing, confusion, unresponsiveness), advise them to call emergency services immediately.

CLINICAL CONTEXT:
You will receive structured biometric data inside <biometric_context> tags. This contains the patient's 24-hour synthesized biometric summary including:
- Resting Heart Rate (RHR) baseline
- Mean SpO2 and minimum SpO2
- Respiratory rate averages
- Heart Rate Variability (HRV) metrics
- Anomaly flags (sustained desaturation below 92%, RHR spikes)
- Clinical narrative from the latest window

You will also receive current vitals and NEWS2/qSOFA scores.

RULES:
1. Always cross-reference the biometric context when the patient asks about fatigue, recovery, or how they're feeling.
2. If NEWS2 is 5+ or any single parameter scores 3, state the escalation timeline explicitly.
3. If qSOFA >= 2, flag sepsis risk and recommend assessment per local sepsis pathway.
4. Be concise but clinically precise. Use bullet points for multiple findings.
5. If you don't have enough data to answer, say so clearly rather than guessing.`;

// ── Build the clinical context block ──────────────────────────────────────────
function buildClinicalContext({ vitals, analysis, context }) {
  const news2 = analysis?.clinicalScores?.news2;
  const qsofa = analysis?.clinicalScores?.qsofa;
  const parts = [];

  // Current vitals
  parts.push('=== CURRENT VITALS ===');
  if (vitals.heartRate) parts.push(`Heart Rate: ${vitals.heartRate} bpm`);
  if (vitals.respiratory) parts.push(`Respiratory Rate: ${vitals.respiratory} /min`);
  if (vitals.oxygen) parts.push(`SpO2: ${vitals.oxygen}%`);
  if (vitals.systolicBp) parts.push(`Systolic BP: ${vitals.systolicBp} mmHg`);
  if (vitals.skinTemp) parts.push(`Temperature: ${vitals.skinTemp}°C`);
  if (vitals.hydration) parts.push(`Hydration: ${vitals.hydration}%`);
  parts.push(`Consciousness: ${vitals.consciousness || 'alert'}`);
  parts.push(`Supplemental Oxygen: ${vitals.supplementalOxygen ? 'Yes (+2 NEWS2)' : 'No'}`);

  // NEWS2
  if (news2) {
    parts.push('');
    parts.push('=== NEWS2 SCORE ===');
    parts.push(`Total: ${news2.total}`);
    parts.push(`Urgency: ${news2.urgency?.level || 'Unknown'}`);
    parts.push(`Action: ${news2.urgency?.action || 'Use local protocol'}`);
    if (news2.urgency?.timelineMinutes !== null && news2.urgency?.timelineMinutes !== undefined) {
      parts.push(`Review timeline: within ${news2.urgency.timelineMinutes} minutes`);
    }
    if (news2.missing?.length) {
      parts.push(`Missing parameters: ${news2.missing.join(', ')}`);
    }
    if (news2.components) {
      parts.push('Components:');
      for (const [key, val] of Object.entries(news2.components)) {
        parts.push(`  ${key}: ${val}`);
      }
    }
  }

  // qSOFA
  if (qsofa) {
    parts.push('');
    parts.push('=== qSOFA SCORE ===');
    parts.push(`Total: ${qsofa.total}`);
    parts.push(`Sepsis Risk Flag: ${qsofa.sepsisRiskFlag ? 'YES - Trigger present' : 'No trigger'}`);
    parts.push(`Action: ${qsofa.urgency?.action || 'Continue monitoring'}`);
  }

  // Risk level
  if (analysis?.riskLevel) {
    parts.push('');
    parts.push(`Overall Risk Level: ${analysis.riskLevel}`);
  }

  return parts.join('\n');
}

// ── AI Chat Endpoint ──────────────────────────────────────────────────────────
router.post('/ai-chat', async (req, res) => {
  const { message, vitals = {}, analysis = null } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const patientId = req.body.patient_id || req.actor.patientId;

  // 1. Fetch biometric context from clinical_summaries
  let context = { available: false, promptBlock: '' };
  try {
    context = await getBiometricContext({ tenantId: req.actor.tenantId, patientId, hours: 24 });
  } catch (err) {
    console.error('Failed to fetch biometric context:', err.message);
  }

  // 2. Build the clinical context block
  const clinicalBlock = buildClinicalContext({ vitals, analysis, context });

  // 3. Build messages for the AI
  const systemContent = `${SYSTEM_PROMPT}\n\n${context.promptBlock ? `Biometric Context:\n${context.promptBlock}\n` : ''}\n${clinicalBlock}`;

  // 4. Try AI, fallback to rule-based
  if (openai.apiKey) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: message },
        ],
        max_tokens: 600,
        temperature: 0.3,
      });

      const reply = completion.choices?.[0]?.message?.content;
      if (reply) {
        await audit(req, 'READ', patientId, { resource: 'ai_chat', contextAvailable: context.available, model: 'gpt-4o-mini' });
        return res.json({ conversationReply: reply, source: 'ai', biometricContext: context.promptBlock });
      }
    } catch (err) {
      console.error('AI chat error:', err.message);
      // Fall through to rule-based
    }
  }

  // 5. Rule-based fallback
  const { clinicalChatReply } = await import('../clinical-context.js');
  const reply = clinicalChatReply({ message, vitals, analysis, context });
  await audit(req, 'READ', patientId, { resource: 'clinical_chat_fallback', contextAvailable: context.available });

  res.json({ conversationReply: reply, source: 'rule', biometricContext: context.promptBlock });
});

export default router;