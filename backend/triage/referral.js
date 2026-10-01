// Red-flag referral rules engine (server-side, pure).
//
// This module turns a clinical score into a referral decision by reading a
// versioned, clinician-authored band table from a content pack. It NEVER
// hard-codes clinical bands. When a pack is missing, invalid, or not approved
// for the current mode, the engine returns an "unavailable" decision so the UI
// can fail safe. It must never return "no referral needed" when it cannot
// evaluate.
//
// The engine takes a NEWS2 result (already computed by clinical-scoring.js) and
// a validated band pack, and returns the first band whose total-score range
// matches. Each band carries the referral action and the timeline.
//
// ReferralBand shape:
//   { minTotal:number, maxTotal:number,
//     action:'self_care'|'urgent_care'|'emergency', instruction:string }
// ReferralDecision shape:
//   { action, instruction, news2Total, region, reviewedBy, evaluated }

function unavailable(reason) {
  return {
    action: 'unavailable',
    instruction: reason,
    news2Total: null,
    region: null,
    reviewedBy: null,
    evaluated: false,
  };
}

function isValidBand(value) {
  if (!value || typeof value !== 'object') return false;
  const band = value;
  if (!Number.isFinite(band.minTotal) || !Number.isFinite(band.maxTotal)) return false;
  if (band.minTotal > band.maxTotal) return false;
  if (!['self_care', 'urgent_care', 'emergency'].includes(band.action)) return false;
  if (typeof band.instruction !== 'string' || band.instruction.trim() === '') return false;
  return true;
}

/**
 * True when a string looks like a credential/license NUMBER rather than a type.
 * The repo may be public, so a license number must never be committed in a pack.
 * Allows a type ("Physician"), refuses a mostly-numeric or long-digit value.
 */
export function looksLikeLicenseNumber(value) {
  if (typeof value !== 'string') return false;
  const compact = value.replace(/\s+/g, '');
  if (compact.length === 0) return false;
  const digits = compact.replace(/\D/g, '');
  if (digits.length === 0) return false;
  if (/\d{5,}/.test(compact)) return true;
  return digits.length / compact.length >= 0.5;
}

/**
 * Validate a parsed referral band pack. Returns { ok, pack } or { ok:false, reason }.
 * Production mode refuses packs not marked clinicallyReviewed.
 */
export function validateReferralPack(raw, options = {}) {
  const label = options.label || 'referral pack';
  if (!raw || typeof raw !== 'object') return { ok: false, reason: `${label} is not an object` };

  for (const field of ['id', 'version', 'reviewer', 'reviewDate', 'region']) {
    const value = raw[field];
    if (typeof value !== 'string' || value.trim() === '') {
      return { ok: false, reason: `${label} is missing required field "${field}"` };
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw.reviewDate))) {
    return { ok: false, reason: `${label} reviewDate must be an ISO date (YYYY-MM-DD)` };
  }
  if (raw.reviewerCredential != null && looksLikeLicenseNumber(raw.reviewerCredential)) {
    return { ok: false, reason: `${label} reviewerCredential looks like a license number; use a credential type only` };
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
    if (!isValidBand(entry)) return { ok: false, reason: `${label} contains an invalid band entry` };
  }

  return {
    ok: true,
    pack: {
      meta: {
        id: raw.id,
        version: raw.version,
        reviewer: raw.reviewer,
        reviewDate: raw.reviewDate,
        region: raw.region,
        clinicallyReviewed: raw.clinicallyReviewed === true,
        ...(typeof raw.reviewerCredential === 'string' ? { reviewerCredential: raw.reviewerCredential } : {}),
      },
      bands: raw.entries,
    },
  };
}

/**
 * Evaluate a NEWS2 result against a band pack.
 *
 * @param news2  Result of calculateNews2() (or { total, complete }).
 * @param rawPack Raw referral pack object (untrusted).
 * @param options.production  Refuse unreviewed packs.
 */
export function evaluateReferral(news2, rawPack, options = {}) {
  if (!news2 || typeof news2 !== 'object' || !Number.isFinite(news2.total)) {
    return unavailable('Referral is unavailable because no complete score was available.');
  }
  if (news2.complete === false) {
    return unavailable('Referral is unavailable until all observations are collected.');
  }

  const validated = validateReferralPack(rawPack, options);
  if (validated.ok === false) {
    return unavailable('Referral is unavailable because no approved guidance pack is loaded.');
  }

  const { meta, bands } = validated.pack;
  const band = bands.find((entry) => news2.total >= entry.minTotal && news2.total <= entry.maxTotal);
  if (!band) {
    // A gap in the band table must never produce a false all-clear.
    return unavailable('Referral is unavailable because the score falls outside the approved bands.');
  }

  return {
    action: band.action,
    instruction: band.instruction,
    news2Total: news2.total,
    region: meta.region,
    reviewedBy: `${meta.reviewer} (${meta.reviewDate})`,
    evaluated: true,
  };
}
