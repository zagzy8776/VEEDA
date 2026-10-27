// Vision analysis route — only runs when a validated vision-capable provider is configured.
// Never fabricates results. Fails safe to OCR + manual description + text conversation.

import { Router } from 'express';
import { audit } from '../security.js';
import { getBiometricContext } from '../clinical-context.js';
import { createRequireAuth } from '../security.js';
import { buildProviderRegistry, providerModel, providerSupports } from '../ai/provider-registry.js';
import {
  callWithFailover,
  capabilityStatus,
  recordProviderFailure,
  recordProviderSuccess,
} from '../ai/provider-router.js';

const requireAuth = createRequireAuth();

const router = Router();

const SYSTEM_PROMPT = `You are VEEDA Vision Assistant — analyze images as a clinical decision support aid.
- Only describe what is visibly present. Do not diagnose, name diseases, suggest treatments, or recommend medications.
- Distinguish clearly between "I can see..." (visible facts) and "possible explanations" (hypotheses).
- If text is visible (labels, instructions, expiry dates), transcribe it exactly.
- If something is unclear or ambiguous, say so.
- Do not claim certainty where there is uncertainty.
- Keep observations factual and grounded in the image.`;

function buildClinicalContext({ vitals, analysis, context, subject }) {
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

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const turns = [];
  for (const entry of history.slice(-6)) {
    const role = entry?.role === 'assistant' ? 'assistant' : entry?.role === 'user' ? 'user' : null;
    const content = typeof entry?.content === 'string' ? entry.content.trim().slice(0, 600) : '';
    if (role && content) turns.push({ role, content });
  }
  return turns;
}

// MIME types allowed for vision analysis
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
// Max 10MB per image
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

export function validateVisionImage(image) {
  if (!image || !image.data || !image.mimeType) return { ok: false, status: 400, error: 'Image data and MIME type are required' };
  if (!ALLOWED_MIME_TYPES.has(image.mimeType)) return { ok: false, status: 400, error: `Unsupported image type: ${image.mimeType}` };
  if (typeof image.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) {
    return { ok: false, status: 400, error: 'Image data must be valid base64' };
  }
  const decoded = Buffer.from(image.data, 'base64');
  const normalizedInput = image.data.replace(/=+$/, '');
  const normalizedDecoded = decoded.toString('base64').replace(/=+$/, '');
  if (!decoded.length || normalizedInput !== normalizedDecoded) return { ok: false, status: 400, error: 'Image data must be valid base64' };
  if (decoded.length > MAX_IMAGE_SIZE) return { ok: false, status: 413, error: 'Image too large (max 10MB)' };
  return { ok: true, byteLength: decoded.length };
}
// Get vision-capable providers from the shared provider chain
export function getVisionProviders(env = process.env) {
  return buildProviderRegistry(env)
    .filter((provider) => providerSupports(provider, 'image'))
    .map((provider) => ({ ...provider, model: providerModel(provider, 'image') }));
}

export function buildVisionMessages({ image, userQuestion, ocrText = '', clinicalBlock = '', history = [], dialoguePlan = '' }) {
  const ocrSupplement = typeof ocrText === 'string' && ocrText.trim()
    ? `\n\nOn-device OCR supplement (may contain errors; use only to help read visible text):\n${ocrText.trim().slice(0, 1200)}`
    : '';
  const guidance = dialoguePlan
    ? `\n\nLocal dialogue plan to preserve while improving only the wording:\n${dialoguePlan}`
    : '';
  const userPrompt = `Here is the current clinical data:\n${clinicalBlock}\n\nUser question: ${userQuestion}${ocrSupplement}${guidance}`;
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...sanitizeHistory(history),
    {
      role: 'user',
      content: [
        { type: 'text', text: userPrompt },
        { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } },
      ],
    },
  ];
}

export function recordVisionProviderFailure(provider, now = Date.now()) {
  recordProviderFailure(provider, 'image', now);
}

export function recordVisionProviderSuccess(provider) {
  recordProviderSuccess(provider, 'image', Date.now(), Date.now());
}

export function visionCapabilityStatus(env = process.env, now = Date.now()) {
  const status = capabilityStatus('image', env, now);
  const labels = {
    NOT_CONFIGURED: 'No validated vision model configured',
    UNSUPPORTED_MODEL: 'Configured model does not support images',
    PROVIDER_UNAVAILABLE: 'Vision provider unavailable',
    AVAILABLE: 'Vision provider configured',
  };
  const notes = {
    NOT_CONFIGURED: 'No vision provider is configured; only OCR is available.',
    UNSUPPORTED_MODEL: 'A provider is configured, but its selected model is not authorized for image input.',
    PROVIDER_UNAVAILABLE: 'Configured vision providers are temporarily unavailable or at their configured limit. OCR remains available.',
  };
  return {
    visionState: status.state,
    visionLabel: labels[status.state],
    available: status.available,
    providers: status.providers,
    ...(notes[status.state] ? { note: notes[status.state] } : {}),
  };
}

router.use(requireAuth);

// Status endpoint so frontend can know if vision is actually available
router.get('/status', (req, res) => {
  return res.json(visionCapabilityStatus());
});

router.post('/analyze', async (req, res) => {
  const { image, vitals = {}, analysis = null, history = [], subject = null, localGuidance = '', message = '' } = req.body;
  const imageValidation = validateVisionImage(image);
  if (!imageValidation.ok) return res.status(imageValidation.status).json({ error: imageValidation.error });

  const patientId = req.user?.id;
  if (!patientId) return res.status(401).json({ error: 'Unauthorized' });

  let context = { available: false, promptBlock: '', summaries: [] };
  try { context = await getBiometricContext({ tenantId: req.actor?.tenantId, patientId, userId: req.user.id, hours: 24 }); } catch (err) { console.error('Failed to fetch biometric context:', err.message); }

  const clinicalBlock = buildClinicalContext({ vitals, analysis, context, subject });
  const dialoguePlan = typeof localGuidance === 'string' ? localGuidance.trim().slice(0, 1200) : '';
  const userQuestion = typeof message === 'string' && message.trim() ? message.trim() : 'Analyze this image. Describe what you see factually. Transcribe any visible text. Do not diagnose.';

  // Check if any vision-capable provider is configured
  const capability = visionCapabilityStatus();
  if (!capability.available) {
    // No vision model available — fall back to OCR + manual description
    return res.json({
      visionState: capability.visionState,
      visionLabel: capability.visionLabel,
      visionNote: capability.note,
      ocrText: image.ocrText || null,
      source: 'ocr',
      biometricContext: context.promptBlock,
    });
  }

  // Vision model is available — send image to provider
  const visionMessages = buildVisionMessages({
    image,
    userQuestion,
    ocrText: image.ocrText,
    clinicalBlock,
    history,
    dialoguePlan,
  });

  const routed = await callWithFailover('image', visionMessages);
  if (routed.reply) {
    await audit(req, 'READ', patientId);
    return res.json({
          visionState: 'AVAILABLE',
          visionLabel: 'Vision available (validated)',
          visionNote: `Vision model ${routed.model} analyzed the image.`,
          visionReply: routed.reply,
          source: 'vision',
          provider: routed.provider.name,
          model: routed.model,
          biometricContext: context.promptBlock,
    });
  }
  for (const error of routed.errors) console.error(`${error.provider} vision error:`, error.message);

  // All vision providers failed
  return res.json({
    visionState: 'FAILED',
    visionLabel: 'Vision processing failed',
    visionNote: 'Vision processing failed. Please try again or describe the image manually.',
    ocrText: image.ocrText || null,
    source: 'ocr',
    biometricContext: context.promptBlock,
  });
});

export default router;
