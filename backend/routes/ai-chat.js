import { Router } from 'express';
import { audit } from '../security.js';
import { getBiometricContext } from '../clinical-context.js';
import { isKnownImageModel, buildProviderRegistry } from '../ai/provider-registry.js';
import { callWithFailover } from '../ai/provider-router.js';
import sql from '../db.js';

const router = Router();
export function isModelVisionCapable(model, providerName = 'openai') {
  return isKnownImageModel(providerName, model);
}

export function providerChain(env = process.env) {
  return buildProviderRegistry(env).map((provider) => ({
    ...provider,
    model: provider.models.text,
    url: provider.baseUrl,
    supportsImageInput: provider.capabilitiesByModel.image.image,
  }));
}

const SYSTEM_PROMPT = `You are VEEDA, the clinical AI doctor in this remote patient monitoring platform.

Speak like an experienced acute-care physician: calm, precise, direct. Short paragraphs. No marketing voice.

CRITICAL reply rules:
1. Answer the user's actual words first. If they say hello / how are you — greet briefly and ask what problem they have. Do not ignore their message.
2. Never start a reply with "VEEDA Clinical Support" or restate the product name.
3. Never repeat the same question you already asked in this conversation (check history).
4. Ask at most ONE new question per turn.
5. Do not dump a long intake checklist. Collect name, age, sex, concern, conditions, allergies, meds gradually only when needed.
6. For guests: once is enough to ask if they are signed in. After that, move on clinically. Later invite sign-up to save the consultation.
7. When symptoms appear: focused history (onset, character, severity 1–10, associated features, red flags).
8. Use supplied vitals / NEWS2 / qSOFA when present; explain what they mean.
9. You may recommend meds, review meds, food/drink advice, ask them to attach a scan/photo, and point them to Map for nearest hospital.
10. Escalate clearly on emergencies. Never invent measurements. Never claim you contacted a hospital.

Tone: clinician talking to a patient. Natural. No canned empathy. No repeated scripts.`;

function buildClinicalContext({ vitals, analysis, context, subject, profileBlock }) {
  const adultScoresAllowed = subject?.adultScoresAllowed !== false;
  const news2 = adultScoresAllowed ? analysis?.clinicalScores?.news2 : null;
  const qsofa = adultScoresAllowed ? analysis?.clinicalScores?.qsofa : null;
  const parts = [];

  if (profileBlock) parts.push(profileBlock, '');

  parts.push('CURRENT VITALS:');
  if (vitals.heartRate != null) parts.push(`- Heart Rate: ${vitals.heartRate} bpm`);
  if (vitals.respiratory != null) parts.push(`- Respiratory Rate: ${vitals.respiratory} /min`);
  if (vitals.oxygen != null) parts.push(`- SpO2: ${vitals.oxygen}%`);
  if (vitals.systolicBp != null) parts.push(`- Systolic BP: ${vitals.systolicBp} mmHg`);
  if (vitals.skinTemp != null) parts.push(`- Temperature: ${vitals.skinTemp}°C`);
  if (vitals.hydration != null) parts.push(`- Hydration estimate: ${vitals.hydration}%`);
  parts.push(`- Consciousness: ${vitals.consciousness || 'alert'}`);
  parts.push(`- Supplemental Oxygen: ${vitals.supplementalOxygen ? 'Yes' : 'No'}`);

  if (!adultScoresAllowed) parts.push('', 'SUBJECT NOTE: child or unknown age — NEWS2, qSOFA, and adult BP interpretation are not validated for this profile.');
  if (news2) {
    parts.push('', 'NEWS2 SCORE:', `- Total: ${news2.total}`, `- Urgency: ${news2.urgency?.level || 'Unknown'}`, `- Action: ${news2.urgency?.action || 'Use local protocol'}`);
    if (news2.urgency?.timelineMinutes != null) parts.push(`- Review timeline: within ${news2.urgency.timelineMinutes} minutes`);
    if (news2.missing?.length) parts.push(`- Missing parameters: ${news2.missing.join(', ')}`);
  }
  if (qsofa) parts.push('', 'qSOFA SCORE:', `- Total: ${qsofa.total}`, `- Sepsis risk trigger: ${qsofa.sepsisRiskFlag ? 'YES' : 'No'}`);
  if (adultScoresAllowed && analysis?.riskLevel) parts.push('', `Overall Risk Level: ${analysis.riskLevel}`);

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

async function loadPatientProfileBlock(userId) {
  if (!userId || userId === 'guest') return '';
  try {
    const { rows: userRows } = await sql.query(
      `SELECT id, email, display_name, date_of_birth, sex, conditions, allergies
       FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    ).catch(() => ({ rows: [] }));

    let profile = userRows[0] || null;
    if (!profile) {
      const { rows } = await sql.query(
        `SELECT * FROM users WHERE id = $1 LIMIT 1`,
        [userId],
      ).catch(() => ({ rows: [] }));
      profile = rows[0] || null;
    }

    const parts = ['PATIENT PROFILE:'];
    if (profile?.display_name || profile?.name) parts.push(`- Name: ${profile.display_name || profile.name}`);
    if (profile?.email) parts.push(`- Email: ${profile.email}`);
    if (profile?.date_of_birth || profile?.dob) {
      const dob = profile.date_of_birth || profile.dob;
      const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000)) : null;
      parts.push(`- Date of birth: ${dob}${age != null ? ` (age ~${age})` : ''}`);
    }
    if (profile?.sex || profile?.gender) parts.push(`- Sex: ${profile.sex || profile.gender}`);
    if (profile?.conditions) {
      const c = Array.isArray(profile.conditions) ? profile.conditions.join(', ') : String(profile.conditions);
      if (c.trim()) parts.push(`- Known conditions: ${c}`);
    }
    if (profile?.allergies) {
      const a = Array.isArray(profile.allergies) ? profile.allergies.join(', ') : String(profile.allergies);
      if (a.trim()) parts.push(`- Allergies: ${a}`);
    }

    try {
      const { rows: meds } = await sql.query(
        `SELECT drug_name, dose, frequency, notes
         FROM medication_plans
         WHERE owner_user_id = $1 AND (active IS NULL OR active = true)
         ORDER BY updated_at DESC NULLS LAST
         LIMIT 20`,
        [userId],
      );
      if (meds?.length) {
        parts.push('', 'CURRENT MEDICATIONS:');
        for (const m of meds) {
          parts.push(`- ${m.drug_name}${m.dose ? ` ${m.dose}` : ''}${m.frequency ? ` — ${m.frequency}` : ''}${m.notes ? ` (${m.notes})` : ''}`);
        }
      }
    } catch { /* table may not exist */ }

    return parts.length > 1 ? parts.join('\n') : '';
  } catch (err) {
    console.error('loadPatientProfileBlock failed:', err.message);
    return '';
  }
}

const MAX_HISTORY_TURNS = 12;
const MAX_TURN_CHARS = 1200;

function usefulLocalGuidance(text) {
  if (!text || typeof text !== 'string') return '';
  const t = text.trim();
  if (t.length < 20) return '';
  if (/i.?m (here with you|listening)/i.test(t)) return '';
  if (/how are you feeling right now/i.test(t) && t.length < 200) return '';
  if (/we do not have to rush/i.test(t)) return '';
  if (/VEEDA Clinical Support/i.test(t)) return '';
  return t.slice(0, 1200);
}

export function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const turns = [];
  for (const entry of history.slice(-MAX_HISTORY_TURNS)) {
    const role = entry?.role === 'assistant' ? 'assistant' : entry?.role === 'user' ? 'user' : null;
    const content = typeof entry?.content === 'string' ? entry.content.trim().slice(0, MAX_TURN_CHARS) : '';
    if (role && content) turns.push({ role, content });
  }
  return turns;
}

export function buildChatMessages({ systemPrompt, history, userPrompt }) {
  return [
    { role: 'system', content: systemPrompt },
    ...sanitizeHistory(history),
    { role: 'user', content: userPrompt },
  ];
}

router.post('/', async (req, res) => {
  const { message, vitals = {}, analysis = null, history = [], subject = null, localGuidance = '' } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

  const isGuest = !req.user?.id;
  const patientId = req.user?.id || 'guest';
  const tenantId = req.actor?.tenantId || process.env.DEFAULT_TENANT_ID || 'default';

  let context = { available: false, promptBlock: '', summaries: [] };
  let profileBlock = '';

  if (!isGuest) {
    try {
      context = await getBiometricContext({
        tenantId,
        patientId,
        userId: req.user.id,
        hours: 24,
      });
    } catch (err) {
      console.error('Failed to fetch biometric context:', err.message);
    }
    profileBlock = await loadPatientProfileBlock(req.user.id);
  }

  const clinicalBlock = buildClinicalContext({ vitals, analysis, context, subject, profileBlock });
  const dialoguePlan = usefulLocalGuidance(localGuidance);
  const guestNote = isGuest
    ? '\n\nSESSION: guest. Answer their message first. Ask "are you signed in?" at most once in the whole conversation. Do not repeat prior questions from history.'
    : '';
  const userPrompt = `Clinical data:\n${clinicalBlock}${guestNote}\n\nPatient says: ${message}${dialoguePlan ? `\n\nSafety context only (do not quote):\n${dialoguePlan}` : ''}`;
  const providerMessages = buildChatMessages({ systemPrompt: SYSTEM_PROMPT, history, userPrompt });

  const routed = await callWithFailover('text', providerMessages);
  if (routed.reply) {
    if (!isGuest) await audit(req, 'READ', patientId);
    return res.json({
      conversationReply: routed.reply,
      source: 'ai',
      provider: routed.provider.name,
      model: routed.model,
      biometricContext: context.promptBlock,
      guest: isGuest,
    });
  }
  for (const error of routed.errors) console.error(`${error.provider} chat error:`, error.message);

  if (dialoguePlan) {
    if (!isGuest) await audit(req, 'READ', patientId);
    return res.json({ conversationReply: dialoguePlan, source: 'local', biometricContext: context.promptBlock, guest: isGuest });
  }

  const { clinicalChatReply } = await import('../clinical-context.js');
  const reply = clinicalChatReply({ message, vitals, analysis, context });
  if (!isGuest) await audit(req, 'READ', patientId);
  return res.json({ conversationReply: reply, source: 'rule', biometricContext: context.promptBlock, guest: isGuest });
});

export default router;
