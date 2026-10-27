import { Router } from 'express';
import { callWithFailover } from '../ai/provider-registry.js';
import { getBiometricContext } from '../services/biometric-context.js';
import { audit } from '../security.js';
import sql from '../db.js';

const SYSTEM_PROMPT = `You are VEEDA Clinical Support — a licensed-grade hospital clinical assistant embedded in a remote patient monitoring platform.

You speak and reason like an experienced acute-care physician. You are calm, precise, structured, and direct.

Core behaviour:
1. Answer the actual user message first.
2. TREAT when the next step is clear — if they name a simple problem and a safe OTC or self-care step fits (e.g. headache → paracetamol dose), give the recommendation immediately with dose, max daily dose, and key cautions. Then at most ONE short follow-up question.
3. When symptoms are mentioned, take a focused history using proper clinical language — but do not stack questions.
4. Integrate supplied vitals, NEWS2/qSOFA, and biometric context. Explain what the numbers mean clinically.
5. Give differential considerations, red-flag warnings, and clear next actions when appropriate.
6. Never invent measurements, diagnoses, or medication doses that are not present in the data or standard OTC guidance.
7. For emergencies or high NEWS2/qSOFA, escalate immediately and clearly.
8. You may advise scanning photos of prescriptions, food, or lab reports, and searching for nearest hospitals/pharmacies when relevant.

Session rules:
- Signed-in users: NEVER ask if they are signed in. Use their profile and preferred name when provided.
- Guests: reply first; collect name/age only if needed for care; invite login for continuity after useful help.
- Max one clinical question per turn. Treat first when safe to do so.

Tone: professional, confident, concise, clinician-to-patient. Avoid repetitive boilerplate.`;

function usefulLocalGuidance(text) {
  if (typeof text !== 'string') return '';
  const t = text.trim();
  if (!t || t.length < 8) return '';
  if (/I(?:'| a)m here with you|I(?:'| a)m listening/i.test(t)) return '';
  return t;
}

function buildClinicalContext({ vitals, analysis, context, subject, profileBlock }) {
  const parts = [];
  if (profileBlock) parts.push(profileBlock, '');
  if (vitals && typeof vitals === 'object') {
    const lines = Object.entries(vitals)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `- ${k}: ${v}`);
    if (lines.length) parts.push('VITALS:', ...lines);
  }
  if (analysis && typeof analysis === 'object') {
    parts.push('', 'ANALYSIS:', JSON.stringify(analysis));
  }
  if (context?.promptBlock) parts.push('', context.promptBlock);
  const adultScoresAllowed = subject?.adultScoresAllowed !== false;
  if (!adultScoresAllowed) parts.push('', 'SUBJECT NOTE: child or unknown age — NEWS2, qSOFA, and adult BP interpretation are not validated for this profile.');
  if (subject?.label) parts.push(`SUBJECT LABEL: ${subject.label}`);
  return parts.join('\n') || 'No clinical data attached.';
}

function buildChatMessages({ systemPrompt, history, userPrompt }) {
  const messages = [{ role: 'system', content: systemPrompt }];
  if (Array.isArray(history)) {
    for (const turn of history.slice(-12)) {
      if (!turn?.role || !turn?.content) continue;
      if (turn.role !== 'user' && turn.role !== 'assistant') continue;
      messages.push({ role: turn.role, content: String(turn.content).slice(0, 4000) });
    }
  }
  messages.push({ role: 'user', content: userPrompt });
  return messages;
}

async function loadPatientProfileBlock(userId) {
  if (!userId) return '';
  try {
    const { rows: userRows } = await sql.query(
      `SELECT id, email, display_name, date_of_birth, sex, conditions, allergies FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    let profile = userRows[0] || null;
    if (!profile) {
      const { rows } = await sql.query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [userId]);
      profile = rows[0] || null;
    }
    const parts = ['PATIENT PROFILE:'];
    if (profile?.display_name || profile?.name) parts.push(`- Name: ${profile.display_name || profile.name}`);
    if (profile?.email) parts.push(`- Email: ${profile.email}`);
    if (profile?.date_of_birth || profile?.dob) {
      const dob = profile.date_of_birth || profile.dob;
      parts.push(`- DOB: ${dob}`);
    }
    if (profile?.sex || profile?.gender) parts.push(`- Sex: ${profile.sex || profile.gender}`);
    if (profile?.conditions) {
      const c = Array.isArray(profile.conditions) ? profile.conditions.join(', ') : String(profile.conditions);
      if (c) parts.push(`- Conditions: ${c}`);
    }
    if (profile?.allergies) {
      const a = Array.isArray(profile.allergies) ? profile.allergies.join(', ') : String(profile.allergies);
      if (a) parts.push(`- Allergies: ${a}`);
    }
    try {
      const { rows: meds } = await sql.query(
        `SELECT drug_name, dose, frequency, notes FROM medication_plans WHERE owner_user_id = $1 AND (active IS NULL OR active = true) ORDER BY updated_at DESC NULLS LAST LIMIT 20`,
        [userId],
      );
      if (meds?.length) {
        parts.push('MEDICATIONS:');
        for (const m of meds) {
          parts.push(`- ${m.drug_name}${m.dose ? ` ${m.dose}` : ''}${m.frequency ? ` — ${m.frequency}` : ''}${m.notes ? ` (${m.notes})` : ''}`);
        }
      }
    } catch {}
    return parts.length > 1 ? parts.join('\n') : '';
  } catch (err) {
    console.error('loadPatientProfileBlock failed:', err.message);
    return '';
  }
}

const router = Router();

router.post('/', async (req, res) => {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const vitals = req.body?.vitals || null;
    const analysis = req.body?.analysis || null;
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const subject = req.body?.subject || null;
    const localGuidance = req.body?.localGuidance || '';

    const isGuest = !req.user?.id;
    const patientId = req.user?.id || 'guest';
    const tenantId = req.actor?.tenantId || process.env.DEFAULT_TENANT_ID || 'default';

    let context = { promptBlock: '' };
    let profileBlock = '';
    if (!isGuest) {
      try {
        context = await getBiometricContext({ tenantId, patientId, userId: req.user.id, hours: 24 });
      } catch (err) {
        console.error('Failed to fetch biometric context:', err.message);
      }
      profileBlock = await loadPatientProfileBlock(req.user.id);
    }

    const clientProfile = req.body?.clientProfile;
    if (clientProfile && typeof clientProfile === 'object') {
      const bits = [];
      if (clientProfile.name) bits.push(`- Preferred name: ${clientProfile.name}`);
      if (clientProfile.age != null && clientProfile.age !== '') bits.push(`- Age: ${clientProfile.age}`);
      if (clientProfile.sex) bits.push(`- Sex: ${clientProfile.sex}`);
      if (clientProfile.conditions) {
        const c = Array.isArray(clientProfile.conditions) ? clientProfile.conditions.join(', ') : String(clientProfile.conditions);
        if (c && c !== 'null') bits.push(`- Conditions: ${c}`);
      }
      if (clientProfile.allergies) {
        const a = Array.isArray(clientProfile.allergies) ? clientProfile.allergies.join(', ') : String(clientProfile.allergies);
        if (a && a !== 'null') bits.push(`- Allergies: ${a}`);
      }
      if (bits.length) {
        const clientBlock = `CLIENT PROFILE (address the patient by this name when present):\n${bits.join('\n')}`;
        profileBlock = profileBlock ? `${profileBlock}\n${clientBlock}` : clientBlock;
      }
    }

    const clinicalBlock = buildClinicalContext({ vitals, analysis, context, subject, profileBlock });
    const dialoguePlan = usefulLocalGuidance(localGuidance);
    const guestNote = isGuest
      ? '\n\nSESSION: guest (not signed in). Treat first. Ask about sign-in at most once in the whole chat — never after thank-you. Max one clinical question per turn.'
      : '\n\nSESSION: signed-in patient. You already know they are logged in. NEVER ask "are you signed in?". Use their profile and preferred name from clinical data above.';
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
      return res.json({ conversationReply: dialoguePlan, source: 'local', guest: isGuest });
    }
    return res.status(503).json({ error: 'No AI provider available', guest: isGuest });
  } catch (error) {
    console.error('ai-chat failed:', error);
    return res.status(500).json({ error: 'Unable to process chat right now' });
  }
});

export default router;
