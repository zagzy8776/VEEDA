// Shared content-pack contract for all clinician-authored material in VEEDA.
//
// No medical content is ever hard-coded in this codebase. Triage rules, red
// flags, intake questions, thresholds and crisis numbers arrive as versioned
// "content packs" that carry provenance (who approved them and when). This
// module is the single validator every pack must pass before the app will use
// it.
//
// Fail-safe rules:
//   - A pack missing any required provenance field is REJECTED.
//   - In production mode a pack that is not marked `clinicallyReviewed: true`
//     is REJECTED. Callers must treat a rejected pack as "feature unavailable"
//     and must never fall back to a fabricated result.

export interface ContentPackMeta {
  /** Stable identifier for the pack, e.g. "intake.febrile.v1". */
  id: string;
  /** Human-readable pack version, e.g. "1.0.0". */
  version: string;
  /** Name or role of the person who reviewed the content. */
  reviewer: string;
  /** ISO date (YYYY-MM-DD) of the review. */
  reviewDate: string;
  /** Region the content applies to, e.g. "NG" or "global". */
  region: string;
  /** True only when a qualified human has approved this exact content. */
  clinicallyReviewed: boolean;
}

export interface ValidatedPack<T> {
  meta: ContentPackMeta;
  entries: T;
}

export type PackValidationResult<T> =
  | { ok: true; pack: ValidatedPack<T> }
  | { ok: false; reason: string };

const REQUIRED_META_FIELDS: (keyof ContentPackMeta)[] = [
  'id',
  'version',
  'reviewer',
  'reviewDate',
  'region',
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a raw content pack object.
 *
 * @param raw        Parsed pack object (untrusted).
 * @param options.production  When true, unreviewed packs are refused.
 * @param options.label       Used in error messages, e.g. "intake pack".
 */
export function validateContentPack<T>(
  raw: unknown,
  options: { production?: boolean; label?: string } = {},
): PackValidationResult<T> {
  const label = options.label || 'content pack';

  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: `${label} is not an object` };
  }

  const candidate = raw as Record<string, unknown>;

  for (const field of REQUIRED_META_FIELDS) {
    const value = candidate[field];
    if (typeof value !== 'string' || value.trim() === '') {
      return { ok: false, reason: `${label} is missing required field "${field}"` };
    }
  }

  if (!ISO_DATE.test(String(candidate.reviewDate))) {
    return { ok: false, reason: `${label} reviewDate must be an ISO date (YYYY-MM-DD)` };
  }

  if (typeof candidate.clinicallyReviewed !== 'boolean') {
    return { ok: false, reason: `${label} must declare "clinicallyReviewed" (boolean)` };
  }

  if (!Array.isArray(candidate.entries)) {
    return { ok: false, reason: `${label} must contain an "entries" array` };
  }

  if (options.production && candidate.clinicallyReviewed !== true) {
    return { ok: false, reason: `${label} is not clinically reviewed and cannot be used in production` };
  }

  const meta: ContentPackMeta = {
    id: String(candidate.id),
    version: String(candidate.version),
    reviewer: String(candidate.reviewer),
    reviewDate: String(candidate.reviewDate),
    region: String(candidate.region),
    clinicallyReviewed: candidate.clinicallyReviewed === true,
  };

  return { ok: true, pack: { meta, entries: candidate.entries as T } };
}

/** Human-readable provenance string for display, e.g. "Reviewed by Dr. X on 2026-01-01 (NG)". */
export function describePack(meta: ContentPackMeta): string {
  return `Reviewed by ${meta.reviewer} on ${meta.reviewDate} (${meta.region})`;
}
