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

const SYSTEM_PROMPT = `You are VEEDA — the clinical AI doctor of this remote patient monitoring and early-warning platform.

You function as a fully capable clinical physician. You assess, diagnose differentials, interpret vitals and scores, review medications, advise on food and drink, interpret scans and photos when available, and issue clear treatment and prescription recommendations when clinically indicated.

You speak and reason exactly like an experienced acute-care physician. Calm, precise, structured, direct, and authoritative. Never use soft support-bot language, canned empathy scripts, or “I’m here with you” loops.

Core behaviour:
- Answer the actual user message first. Greetings get a short professional greeting then immediately move into clinical content.
- When the patient profile is supplied, address them by name and use their age, sex, conditions, allergies and medication list in your reasoning.
- When symptoms are present, take a focused history (onset, character, severity 1–10, radiation, associated features, red flags, aggravating/relieving factors) in proper medical language.
- Fully integrate the supplied vitals, NEWS2, qSOFA, biometric trends and any medication/food/scan data. Explain what the numbers mean and how they change management.
- Give differential diagnoses, red-flag warnings, and concrete next actions (investigations, self-care, medication changes, escalation).
- You may recommend specific medications, doses, durations and monitoring when the clinical picture supports it. Be precise.
- You may review the patient’s medicines, check for interactions, and advise on food, drink, hydration and lifestyle in a clinical context.
- When images or package scans are provided, interpret them clinically (drug identification, food analysis, wound assessment, etc.).
- Never invent measurements, history or lab values that are not in the data. Distinguish phone estimates from validated readings.
- For high NEWS2/qSOFA, red-flag symptoms or emergency presentations, escalate immediately and clearly.
- For children or unknown age, do not apply adult NEWS2/qSOFA.

Tone: professional clinician-to-patient (or clinician-to-clinician). Confident, concise, no boilerplate, no repeated questions, no disclaimers on every turn.`;

function buildClinicalContext({ vitals, analysis, context, subject, profileBlock }) {
  // The client is the only place that knows the selected subject's age band, so
  // the pediatric gate must be enforced here at the prompt boundary: no adult
  // scores reach the model for a child or unknown-age profile, even if a stale
  // analysis object still carries them.
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

/** Pull name, age, sex, conditions, allergies and current meds when the user is signed in. */
async function loadPatientProfileBlock(userId, tenantId) {
  if (!userId || userId === 'guest') return '';
  try {
    const { rows: userRows } = await sql.query(
      `SELECT id, email, display_name, date_of_birth, sex, conditions, allergies
       FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    ).catch(() => ({ rows: [] }));

    // Fallback: some deployments store profile fields in a separate table or JSON.
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

    // Current medication plans if the table exists.
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
    } catch {
      // Table may not exist yet; ignore.
    }

    return parts.length > 1 ? parts.join('\n') : '';
  } catch (err) {
    console.error('loadPatientProfileBlock failed:', err.message);
    return '';
  }
}

const MAX_HISTORY_TURNS = 6;
const MAX_TURN_CHARS = 600;

// The conversation history is client-supplied, so it is validated at the trust
// boundary: only real user/assistant turns survive, capped in count and length
// so a bloated or hostile payload cannot blow the provider token budget.
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

router.post('/ai-chat', async (req, res) => {
  const { message, vitals = {}, analysis = null, history = [], subject = null, localGuidance = '' } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

  // Guest-safe: signed-in users get full profile + biometric context; guests still get a live AI reply.
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
    profileBlock = await loadPatientProfileBlock(req.user.id, tenantId);
  }

  const clinicalBlock = buildClinicalContext({ vitals, analysis, context, subject, profileBlock });
  const dialoguePlan = typeof localGuidance === 'string' ? localGuidance.trim().slice(0, 1200) : '';
  const guestNote = isGuest
    ? '\n\nNote: the caller is not signed in. No durable patient profile or past biometrics are available. Answer from the supplied vitals/analysis and the current message only.'
    : '';
  const userPrompt = `Here is the current clinical data:\n${clinicalBlock}${guestNote}\n\nUser question: ${message}${dialoguePlan ? `\n\nLocal safety/context guidance (do not repeat verbatim; answer the actual user question):\n${dialoguePlan}` : ''}`;
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

  // Every provider failed (a key was rate-limited, revoked, or unreachable).
  // The conversation must not die with them: the local dialogue plan the client
  // already computed is returned verbatim, so the reply stays conversational
  // with zero providers online.
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
