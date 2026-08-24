import { Router } from 'express';
import { audit } from '../security.js';
import { getBiometricContext } from '../clinical-context.js';

const router = Router();
const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const cerebrasModel = process.env.CEREBRAS_MODEL || 'gpt-oss-120b';
const groqModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const SYSTEM_PROMPT = `You are VEEDA Clinical Decision Support Agent — an AI clinical assistant trained on NEWS2 and qSOFA protocols.

ROLE:
- You are a Clinical Decision Support Agent, not a substitute for a clinician.
- Reference calculated NEWS2 and qSOFA when discussing patient observations.
- Do not invent measurements, diagnoses, sensor confidence, or clinical history.
- If required data are missing or a measurement source is not validated, say so clearly.
- For emergency symptoms such as chest pain, severe difficulty breathing, confusion, or unresponsiveness, advise immediate emergency escalation.
- qSOFA >= 2 is a risk trigger for further assessment, not a sepsis diagnosis.
- Use the supplied clinical scoring output as authoritative; do not recalculate scores differently.

DATA QUALITY:
- Distinguish measured, manually entered, unavailable, and derived values.
- Do not present wellness estimates as clinical measurements.
- State review timelines only when present in the supplied clinical analysis.
- If enough data are not available, say so rather than guessing.`;

function buildClinicalContext({ vitals, analysis, context }) {
  const news2 = analysis?.clinicalScores?.news2;
  const qsofa = analysis?.clinicalScores?.qsofa;
  const parts = ['CURRENT VITALS:'];
  if (vitals.heartRate != null) parts.push(`- Heart Rate: ${vitals.heartRate} bpm`);
  if (vitals.respiratory != null) parts.push(`- Respiratory Rate: ${vitals.respiratory} /min`);
  if (vitals.oxygen != null) parts.push(`- SpO2: ${vitals.oxygen}%`);
  if (vitals.systolicBp != null) parts.push(`- Systolic BP: ${vitals.systolicBp} mmHg`);
  if (vitals.skinTemp != null) parts.push(`- Temperature: ${vitals.skinTemp}°C`);
  if (vitals.hydration != null) parts.push(`- Hydration estimate: ${vitals.hydration}%`);
  parts.push(`- Consciousness: ${vitals.consciousness || 'alert'}`);
  parts.push(`- Supplemental Oxygen: ${vitals.supplementalOxygen ? 'Yes' : 'No'}`);

  if (news2) {
    parts.push('', 'NEWS2 SCORE:', `- Total: ${news2.total}`, `- Urgency: ${news2.urgency?.level || 'Unknown'}`, `- Action: ${news2.urgency?.action || 'Use local protocol'}`);
    if (news2.urgency?.timelineMinutes != null) parts.push(`- Review timeline: within ${news2.urgency.timelineMinutes} minutes`);
    if (news2.missing?.length) parts.push(`- Missing parameters: ${news2.missing.join(', ')}`);
  }
  if (qsofa) parts.push('', 'qSOFA SCORE:', `- Total: ${qsofa.total}`, `- Sepsis risk trigger: ${qsofa.sepsisRiskFlag ? 'YES' : 'No'}`);
  if (analysis?.riskLevel) parts.push('', `Overall Risk Level: ${analysis.riskLevel}`);

  const latestWindow = context?.summaries?.[0];
  if (latestWindow) {
    parts.push('', '24-HOUR BIOMETRIC SUMMARY:');
    if (latestWindow.baselines?.restingHeartRate) parts.push(`- Resting Heart Rate: ${latestWindow.baselines.restingHeartRate} bpm`);
    if (latestWindow.baselines?.meanSpo2) parts.push(`- Mean SpO2: ${latestWindow.baselines.meanSpo2}%`);
    if (latestWindow.baselines?.meanRespiratoryRate) parts.push(`- Mean Respiratory Rate: ${latestWindow.baselines.meanRespiratoryRate} /min`);
    if (latestWindow.variability?.rmssdMs) parts.push(`- HRV (RMSSD): ${latestWindow.variability.rmssdMs} ms`);
    if (latestWindow.anomalies?.sustainedSpo2Below92ForTwoMinutes) parts.push('- ⚠ Sustained SpO2 below 92% for over 2 minutes');
    if (latestWindow.anomalies?.restingHeartRateSpike) parts.push('- ⚠ Resting heart rate spike detected');
    if (latestWindow.clinicalNarrative) parts.push(`- Narrative: ${latestWindow.clinicalNarrative}`);
  }
  return parts.join('\n');
}

async function callOpenAICompatible(url, apiKey, model, system, user) {
  if (!apiKey) return null;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      max_tokens: 900,
    }),
  });
  if (!r.ok) throw new Error(`${model} HTTP ${r.status}`);
  const data = await r.json();
  return data?.choices?.[0]?.message?.content?.trim() || null;
}

router.post('/ai-chat', async (req, res) => {
  const { message, vitals = {}, analysis = null } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

  const patientId = req.actor?.patientId;
  if (!patientId || patientId === 'anonymous') return res.status(403).json({ error: 'Authenticated patient context is required' });

  let context = { available: false, promptBlock: '', summaries: [] };
  try { context = await getBiometricContext({ tenantId: req.actor.tenantId, patientId, hours: 24 }); } catch (err) { console.error('Failed to fetch biometric context:', err.message); }

  const clinicalBlock = buildClinicalContext({ vitals, analysis, context });
  const userPrompt = `Here is the current clinical data:\n${clinicalBlock}\n\nUser question: ${message}`;

  const providers = [
    { name: 'cerebras', url: CEREBRAS_API_URL, key: process.env.CEREBRAS_API_KEY, model: cerebrasModel },
    { name: 'groq', url: GROQ_API_URL, key: process.env.GROQ_API_KEY, model: groqModel },
  ];

  for (const provider of providers) {
    if (!provider.key) continue;
    try {
      const reply = await callOpenAICompatible(provider.url, provider.key, provider.model, SYSTEM_PROMPT, userPrompt);
      if (reply) {
        await audit(req, 'READ', patientId, { resource: 'ai_chat', contextAvailable: context.available, provider: provider.name, model: provider.model });
        return res.json({ conversationReply: reply, source: 'ai', provider: provider.name, model: provider.model, biometricContext: context.promptBlock });
      }
    } catch (err) {
      console.error(`${provider.name} chat error:`, err.message);
    }
  }

  const { clinicalChatReply } = await import('../clinical-context.js');
  const reply = clinicalChatReply({ message, vitals, analysis, context });
  await audit(req, 'READ', patientId, {
    resource: 'clinical_chat_fallback',
    contextAvailable: context.available,
    cerebrasConfigured: Boolean(process.env.CEREBRAS_API_KEY),
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
  });
  return res.json({ conversationReply: reply, source: 'rule', biometricContext: context.promptBlock });
});

export default router;
