import { Router } from 'express';
import { audit } from '../security.js';
import { getBiometricContext } from '../clinical-context.js';
import { isKnownImageModel, buildProviderRegistry } from '../ai/provider-registry.js';
import { capabilityStatus, callWithFailover } from '../ai/provider-router.js';

import { environmentContext } from '../ai/environment-context.js';

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

const SYSTEM_PROMPT = `You are VEEDA, a conversational AI health assistant for continuous support.

CONSULTATION STYLE:
- Listen to the actual question first. Respond directly, acknowledge the concern, and use relevant history without repeating a template.
- Give a short, useful explanation and a concrete next step. Ask one focused follow-up when needed; do not force a question onto every answer.
- Do not abandon a user with a bare refusal or "I cannot assist". Explain what you can safely help with, what remains uncertain, and how to get appropriate help.
- Answer general non-medical questions when possible. Never invent an answer to satisfy a request; when a request cannot be safely fulfilled, explain briefly and offer a useful safe alternative.
- Do not claim to be a doctor, to diagnose, prescribe, continuously monitor the user, or perform an action that the app has not confirmed.
- For medicine questions, explain general uses and precautions. Do not invent a personalized regimen; clarify relevant age, allergies, other medicines and pregnancy status where needed.
- Outdoor weather and air quality can contextualize a question but cannot establish the cause of symptoms. Ask about actual exposure instead of assuming it.
- Missing data should lead to a helpful question or practical next step, not a generic score report.

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
- If enough data are not available, say so rather than guessing.

REPLY STYLE:
Use plain language and concise paragraphs, usually under 200 words. Discuss scores only when relevant to the question and present in the supplied analysis. When symptoms are described, consider onset, severity and red flags; ask the most useful missing question. Explain possibilities as possibilities, never a confirmed diagnosis. If emergency symptoms are present, put immediate help before further questions.

ESCALATION LADDER — recommend the lowest rung that covers the risk:
- CHECK-IN: self-monitor and recheck the observations.
- TRUSTED CONTACT: ask a family member or carer to check in.
- MEDICAL CARE: contact a clinic or clinician today.
- EMERGENCY: emergency services now.
You can only RECOMMEND a rung. Never claim you started, called, or notified anyone — every escalation is confirmed by a human in the app.

PEDIATRIC RULE:
- When the clinical data says the subject is a child or unknown age, do not use NEWS2, qSOFA, or adult blood-pressure interpretation. State that these adult tools are not validated for children, give general safety guidance, and keep a low threshold for recommending medical care.

LOCAL DIALOGUE:
- When a local dialogue plan is supplied, preserve relevant safety advice and empathy; verify its facts against supplied data and ask its engagement question only if relevant.
- Answer the actual user question using conversation history and the supplied context. Treat the local plan as safety guidance, not a script to paraphrase. Ask one relevant follow-up only when more information is needed.
- The local plan is not evidence: never add measurements, diagnoses, medication doses, or claims that an action was taken.`;

function buildClinicalContext({ vitals, analysis, context, subject }) {
  // The client is the only place that knows the selected subject's age band, so
  // the pediatric gate must be enforced here at the prompt boundary: no adult
  // scores reach the model for a child or unknown-age profile, even if a stale
  // analysis object still carries them.
  const adultScoresAllowed = subject?.adultScoresAllowed !== false;
  const news2 = adultScoresAllowed ? analysis?.clinicalScores?.news2 : null;
  const qsofa = adultScoresAllowed ? analysis?.clinicalScores?.qsofa : null;
  const parts = ['CURRENT VITALS:'];
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
  const { message, vitals = {}, analysis = null, history = [], subject = null, localGuidance = '', environment = null } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

  const patientId = req.user.id;

  let context = { available: false, promptBlock: '', summaries: [] };
  try { context = await getBiometricContext({ tenantId: req.actor.tenantId, patientId, userId: req.user.id, hours: 24 }); } catch (err) { console.error('Failed to fetch biometric context:', err.message); }

  const clinicalBlock = buildClinicalContext({ vitals, analysis, context, subject });
  const outdoorBlock = environmentContext(environment);
  const dialoguePlan = typeof localGuidance === 'string' ? localGuidance.trim().slice(0, 1200) : '';
  const userPrompt = `Here is the current clinical data:\n${clinicalBlock}\n\n${outdoorBlock}\n\nUser question: ${message}${dialoguePlan ? `\n\nLocal safety guidance (not a script):\n${dialoguePlan}` : ''}`;
  const providerMessages = buildChatMessages({ systemPrompt: SYSTEM_PROMPT, history, userPrompt });

  const routed = await callWithFailover('text', providerMessages);
  if (routed.reply) {
    await audit(req, 'READ', patientId);
    return res.json({ conversationReply: routed.reply, source: 'ai', provider: routed.provider.name, model: routed.model, biometricContext: context.promptBlock });
  }
  for (const error of routed.errors) console.error(`${error.provider} chat error:`, error.message);

  // Every provider failed (a key was rate-limited, revoked, or unreachable).
  // The conversation must not die with them: the local dialogue plan the client
  // already computed is returned verbatim, so the reply stays conversational
  // with zero providers online.
  const aiStatus = capabilityStatus('text');
  const aiState = routed.errors.length ? 'PROVIDER_UNAVAILABLE' : aiStatus.state;
  if (dialoguePlan) {
    await audit(req, 'READ', patientId);
    return res.json({ conversationReply: dialoguePlan, source: 'local', aiState, biometricContext: context.promptBlock });
  }

  const { clinicalChatReply } = await import('../clinical-context.js');
  const reply = clinicalChatReply({ message, vitals, analysis, context });
  await audit(req, 'READ', patientId);
  return res.json({ conversationReply: reply, source: 'rule', aiState, biometricContext: context.promptBlock });
});

export default router;
