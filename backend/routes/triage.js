import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sql from '../db.js';
import { audit } from '../security.js';
import { calculateNews2 } from '../clinical-scoring.js';
import { adultScoresAllowed, resolveAdultGate, CHILD_NOT_VALIDATED_NOTE } from '../age-gate.js';
import { evaluateReferral } from '../triage/referral.js';

// The emergency number is verified configuration, never hard-coded. When it is
// not set the deployment must say "call your local emergency number" instead of
// naming a guessed default.
const EMERGENCY_NUMBER = process.env.EMERGENCY_NUMBER || null;

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

export function createTriageRouter({ db = sql } = {}) {
  const router = Router();

  // POST /api/triage/referral  { vitals: {...} }
  // Computes NEWS2 and returns the referral decision. Never diagnoses; a missing
  // or unapproved pack yields an "unavailable" decision rather than a false calm.
  router.post('/triage/referral', async (req, res) => {
    const { vitals = {}, clinical = {} } = req.body || {};

    // ── Adult-only NEWS2 must never be computed for a child ──
    // The referral engine scores NEWS2, an adult tool. When the request is about
    // a dependant, the SERVER looks that dependant up (scoped to the signed-in
    // guardian) and takes the age from the stored record — the client's own age
    // claim is never trusted. For a dependant below the server-configured cutoff,
    // or of unknown age, the server REFUSES to score and returns an "unavailable"
    // referral instead of a number a carer could act on. The cutoff is server
    // config, not a Vite variable. A request with no dependant is the owner.
    const subject = await resolveAdultGate(req.body, { guardianUserId: req.user?.id, db });
    if (!subject.owned) {
      // A dependent_id that does not belong to the caller is refused outright.
      await audit(req, 'ACCESS_DENIED', null, { resource: 'triage_referral', action: 'forbidden_subject' });
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (subject.declared && !adultScoresAllowed(subject.age)) {
    await audit(req, 'READ', null, { resource: 'triage_referral', action: 'unavailable_child' });
    return res.json({
      referral: {
        action: 'unavailable',
        reason: CHILD_NOT_VALIDATED_NOTE,
        detail: 'NEWS2 is an adult tool and is not validated for children, so no referral band is produced.',
      },
      news2: null,
      adultScoresAllowed: false,
      emergencyNumber: null,
      emergencyNumberGeneric: EMERGENCY_NUMBER,
    });
  }

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

  return router;
}

export default createTriageRouter();
