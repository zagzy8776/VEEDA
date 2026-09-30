import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { audit } from '../security.js';
import { calculateNews2 } from '../clinical-scoring.js';
import { evaluateReferral } from '../triage/referral.js';

const router = Router();
const EMERGENCY_NUMBER = process.env.EMERGENCY_NUMBER || '112';

// The referral band pack is clinician-authored content. In production a real,
// reviewed pack must be supplied by path (REFERRAL_PACK_PATH); otherwise the
// engine fails safe and returns "unavailable". The bundled sample is only used
// outside production and is clearly marked NOT CLINICALLY REVIEWED.
function loadPack() {
  const path = process.env.REFERRAL_PACK_PATH;
  if (path) {
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      console.error('referral pack could not be read', err.message);
      return null;
    }
  }
  if (process.env.NODE_ENV === 'production') return null;
  try {
    return JSON.parse(
      readFileSync(fileURLToPath(new URL('../triage/referralPack.sample.json', import.meta.url)), 'utf8'),
    );
  } catch {
    return null;
  }
}

// POST /api/triage/referral  { vitals: {...} }
// Computes NEWS2 and returns the referral decision. Never diagnoses; a missing
// or unapproved pack yields an "unavailable" decision rather than a false calm.
router.post('/triage/referral', async (req, res) => {
  const { vitals = {}, clinical = {} } = req.body || {};
  const input = {
    heartRate: vitals.heartRate,
    respiratoryRate: vitals.respiratoryRate,
    oxygenSaturation: vitals.oxygenSaturation,
    temperature: vitals.temperature ?? vitals.skinTemp,
    systolicBp: vitals.systolicBp,
    consciousness: clinical.consciousness ?? vitals.consciousness ?? 'alert',
    supplementalOxygen: Boolean(clinical.supplementalOxygen ?? vitals.supplementalOxygen),
  };

  let news2 = null;
  try {
    news2 = calculateNews2(input);
  } catch {
    news2 = null;
  }

  const pack = loadPack();
  const decision = evaluateReferral(news2, pack, { production: process.env.NODE_ENV === 'production' });

  await audit(req, 'READ', null, { resource: 'triage_referral', action: decision.action });

  res.json({
    referral: decision,
    news2: news2 ? { total: news2.total, complete: news2.complete, missing: news2.missing } : null,
    emergencyNumber: decision.action === 'emergency' ? EMERGENCY_NUMBER : null,
    emergencyNumberGeneric: EMERGENCY_NUMBER,
  });
});

export default router;
