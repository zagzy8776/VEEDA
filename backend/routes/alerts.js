import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { audit } from '../security.js';

const router = Router();

// The emergency number is verified configuration, never hard-coded.
const EMERGENCY_NUMBER = process.env.EMERGENCY_NUMBER || null;

// Alert wording is clinician-authored content. In production a real, reviewed
// pack must be supplied by path (ALERT_PACK_PATH); otherwise this route fails
// safe and reports the panel as "unavailable". The bundled example pack is only
// used outside production and is clearly marked NOT CLINICALLY REVIEWED.
//
// This backend validator mirrors src/app/alerts.ts in plain JS so the server (a
// plain-node process) never imports TypeScript. The client and server must agree
// on the trusted-source policy, so the rules are pinned by tests on both sides.

const KIND_TRUSTED_SOURCES = {
  weather: ['trusted_feed'],
  air_quality: ['trusted_feed'],
  fire: ['trusted_feed', 'paired_alarm'],
  disease: ['trusted_feed'],
  barometer: ['device_sensor'],
  battery: ['device_sensor'],
  home_safety: ['paired_alarm', 'device_sensor'],
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const ALL_SOURCES = ['trusted_feed', 'device_sensor', 'paired_alarm', 'phone_guess'];

function isValidRule(value) {
  if (!value || typeof value !== 'object') return false;
  if (typeof value.id !== 'string' || !value.id.trim()) return false;
  if (typeof value.kind !== 'string' || !(value.kind in KIND_TRUSTED_SOURCES)) return false;
  if (typeof value.message !== 'string' || !value.message.trim()) return false;
  if (typeof value.severity !== 'string') return false;
  if (!Array.isArray(value.allowedSources) || value.allowedSources.length === 0) return false;
  return value.allowedSources.every(s => typeof s === 'string' && ALL_SOURCES.includes(s));
}

/** Validate a raw alert pack, enforcing the shared provenance + production rules. */
export function validateAlertPack(raw, options = {}) {
  const label = options.label || 'alert pack';
  if (!raw || typeof raw !== 'object') return { ok: false, reason: `${label} is not an object` };

  for (const field of ['id', 'version', 'reviewer', 'reviewDate', 'region']) {
    const value = raw[field];
    if (typeof value !== 'string' || value.trim() === '') {
      return { ok: false, reason: `${label} is missing required field "${field}"` };
    }
  }
  if (!ISO_DATE.test(String(raw.reviewDate))) {
    return { ok: false, reason: `${label} reviewDate must be an ISO date (YYYY-MM-DD)` };
  }
  if (typeof raw.clinicallyReviewed !== 'boolean') {
    return { ok: false, reason: `${label} must declare "clinicallyReviewed" (boolean)` };
  }
  if (options.production && raw.clinicallyReviewed !== true) {
    return { ok: false, reason: `${label} is not clinically reviewed and cannot be used in production` };
  }
  if (!Array.isArray(raw.entries) || raw.entries.length === 0) {
    return { ok: false, reason: `${label} must contain a non-empty "entries" array` };
  }
  for (const entry of raw.entries) {
    if (!isValidRule(entry)) return { ok: false, reason: `${label} contains an invalid rule entry` };
  }
  return {
    ok: true,
    pack: {
      meta: {
        id: raw.id, version: raw.version, reviewer: raw.reviewer,
        reviewDate: raw.reviewDate, region: raw.region,
        clinicallyReviewed: raw.clinicallyReviewed === true,
      },
      rules: raw.entries,
    },
  };
}

/** True when a source may raise this kind — the fire/smoke/CO guard. */
export function isSourceTrusted(kind, source) {
  if (source === 'phone_guess') return false;
  const trusted = KIND_TRUSTED_SOURCES[kind] || [];
  return trusted.includes(source);
}

function loadPack() {
  const path = process.env.ALERT_PACK_PATH;
  if (path) {
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      console.error('alert pack could not be read', err.message);
      return null;
    }
  }
  if (process.env.NODE_ENV === 'production') return null;
  try {
    return JSON.parse(
      readFileSync(fileURLToPath(new URL('../../src/app/alertPack.example.json', import.meta.url)), 'utf8'),
    );
  } catch {
    return null;
  }
}

// GET /api/alerts/pack
// Returns the reviewed alert rules (wording) to the client, or an explicit
// "not available" state. It never invents wording and never returns a rule from
// an unreviewed pack in production.
router.get('/alerts/pack', async (req, res) => {
  const production = process.env.NODE_ENV === 'production';
  const pack = loadPack();
  const loaded = pack ? validateAlertPack(pack, { production }) : { ok: false, reason: 'no alert pack configured' };

  await audit(req, 'READ', null, { resource: 'alerts_pack' });

  if (loaded.ok === false) {
    return res.json({ available: false, reason: loaded.reason, emergencyNumber: EMERGENCY_NUMBER });
  }
  return res.json({
    available: true,
    meta: loaded.pack.meta,
    rules: loaded.pack.rules,
    emergencyNumber: EMERGENCY_NUMBER,
  });
});

export default router;
