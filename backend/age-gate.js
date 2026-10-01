/**
 * Server-side adult-only clinical age gate.
 *
 * NEWS2 and qSOFA are adult tools (widely documented as validated for people
 * aged 16+ and not for children or pregnancy). Adult blood-pressure
 * interpretation is likewise an adult-only judgement. This gate is the SERVER's
 * own guard: it must NOT be a client/Vite variable, because a client cannot be
 * trusted to refuse a score for a child. It reads the cutoff from server
 * configuration, and it fails CLOSED — a missing or unparseable cutoff falls
 * back to a safe default, and an unknown age is never treated as an adult.
 *
 * The client has a parallel, build-time cutoff (`VITE_ADULT_AGE_CUTOFF`) used
 * only for DISPLAY. It is not a safety control; this module is.
 */

/**
 * Default adult cutoff used ONLY when server config is absent or invalid. The
 * deploying clinician sets the real value via server env `ADULT_AGE_CUTOFF`.
 * The default keeps a child from ever being silently scored as an adult if the
 * value is missing.
 */
export const DEFAULT_ADULT_AGE_CUTOFF = 16;

/** The configured adult age cutoff from SERVER config (never a Vite variable). */
export function adultAgeCutoff(env = process.env) {
  const raw = env?.ADULT_AGE_CUTOFF;
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_ADULT_AGE_CUTOFF;
}

export const CHILD_NOT_VALIDATED_NOTE = 'Not validated for children';

/**
 * How long an unconfirmed/old age may still be trusted, in months. Read from
 * SERVER config `AGE_RECONFIRM_MONTHS`; defaults to 12. A dependant whose age
 * was recorded longer ago than this is treated as UNKNOWN and gets no adult
 * scores until a carer confirms it again. This guards against a stale entry
 * keeping an adult classified as a child (the unsafe direction for a gate).
 */
export const DEFAULT_AGE_RECONFIRM_MONTHS = 12;

export function ageReconfirmMonths(env = process.env) {
  const raw = env?.AGE_RECONFIRM_MONTHS;
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_AGE_RECONFIRM_MONTHS;
}

/**
 * Work out an age from a stored birth year and an optional birth month, at a
 * given moment. This is where the "age" is derived on the server, so the value
 * is always current instead of frozen at capture time.
 *
 * `birthMonth` is optional. When it is known and the birthday has not come round
 * yet this year, the person is one year younger. When the month is unknown the
 * birthday is assumed to have passed, which yields the HIGHER age — the safe
 * direction for an adult gate (erring toward "adult" can never wrongly call an
 * adult a child, and an adult tool is the thing being protected).
 *
 * Returns null (UNKNOWN) when there is no usable birth year.
 */
export function ageFromBirthYear(birthYear, birthMonth = null, now = new Date()) {
  const year = Number(birthYear);
  if (!Number.isFinite(year) || year < 1900 || year > 2200) return null;
  const currentYear = now.getFullYear();
  if (year > currentYear) return null; // a future birth year is not usable
  const currentMonth = now.getMonth() + 1;
  const month = Number(birthMonth);
  const monthKnown = Number.isFinite(month) && month >= 1 && month <= 12;
  let age = currentYear - year;
  if (monthKnown && currentMonth < month) age -= 1;
  return age >= 0 ? age : null;
}

/**
 * Whether a stored age record is still trustworthy at `now`. A dependant's age
 * is KNOWN only when a human confirmed it and that confirmation is not older
 * than the configured re-confirm interval. Anything else is UNKNOWN — no adult
 * scores — which fails closed for a child and never leaves a stale record
 * wedging an adult into the child band.
 */
export function ageConfirmationCurrent({ ageConfirmed, ageConfirmedAt }, now = new Date(), reconfirmMonths = ageReconfirmMonths()) {
  if (ageConfirmed !== true) return false;
  if (ageConfirmedAt == null) return false;
  const confirmed = new Date(ageConfirmedAt);
  if (Number.isNaN(confirmed.getTime())) return false;
  const cutoff = new Date(confirmed);
  cutoff.setMonth(cutoff.getMonth() + reconfirmMonths);
  return now.getTime() <= cutoff.getTime();
}

/** Classify an age against the configured cutoff. Unknown stays unknown. */
export function ageBand(age, cutoff = adultAgeCutoff()) {
  if (age == null || !Number.isFinite(Number(age))) return 'unknown';
  return Number(age) >= cutoff ? 'adult' : 'child';
}

/**
 * Whether adult-only clinical scores (NEWS2, qSOFA, adult BP interpretation)
 * may be computed for this age. True only for a KNOWN adult. A child OR an
 * unknown age returns false so no adult score is ever produced for them.
 */
export function adultScoresAllowed(age, cutoff = adultAgeCutoff()) {
  return ageBand(age, cutoff) === 'adult';
}

/**
 * Find the dependent reference a request is about, if any.
 *
 * The client may name a dependant with `dependent_id`/`dependentId` at the top
 * level, or with `subject.id` (anything that is not the owner "self"). The
 * client's declared AGE is deliberately ignored here: the caller cannot be
 * trusted to say how old a dependant is, so the age is looked up on the server.
 *
 * Returns `{ isDependent: boolean, dependentId: string | null }`. No reference
 * at all means the readings are for the signed-in owner (an adult).
 */
export function dependentRef(body = {}) {
  const subject = body?.subject;
  if (subject && typeof subject === 'object') {
    const isOwner = subject.type === 'self' || subject.id === 'self';
    if (!isOwner && subject.id != null) return { isDependent: true, dependentId: String(subject.id) };
  }
  const dependentId = body?.dependent_id ?? body?.dependentId;
  if (dependentId != null) return { isDependent: true, dependentId: String(dependentId) };
  return { isDependent: false, dependentId: null };
}

/**
 * Resolve the subject of a request, SERVER-SIDE, without trusting the client.
 *
 * - No dependent reference → the signed-in owner, who is an adult by definition
 *   (the client sends no age for them). `{ declared: false }`, not gated.
 * - A dependent reference → look the dependant up ON THE SERVER, scoped to the
 *   guardian, and compute its age from the CONFIRMED stored birth year. The
 *   client's own age claim is never used. A dependant with no birth year, or
 *   whose age confirmation has gone stale, is UNKNOWN age (no adult scores). A
 *   dependent_id that is not owned by the caller is rejected with `owned: false`.
 *
 * Returns `{ declared, age, owned, dependentId }`. `owned` is false only when a
 * dependent reference was given but does not belong to the guardian; the caller
 * must reject the request in that case.
 */
export async function resolveAdultGate(body = {}, { guardianUserId = null, db = null } = {}) {
  const ref = dependentRef(body);
  if (!ref.isDependent) return { declared: false, age: null, owned: true, dependentId: null };

  // No database (or no authenticated guardian) means we cannot verify the
  // dependant, so we fail CLOSED: treat the age as unknown and refuse to score.
  if (!db || guardianUserId == null) {
    return { declared: true, age: null, owned: true, dependentId: ref.dependentId };
  }

  try {
    const { rows } = await db.query(
      `SELECT birth_year, birth_month, age_confirmed, age_confirmed_at
         FROM dependents WHERE id = $1 AND guardian_user_id = $2 LIMIT 1`,
      [ref.dependentId, guardianUserId],
    );
    if (!rows.length) return { declared: true, age: null, owned: false, dependentId: ref.dependentId };
    const record = rows[0] ?? {};
    // The age is derived HERE, at request time, from the stored birth year, so a
    // dependant keeps crossing the cutoff as they actually grow up. A record
    // whose confirmation has gone stale is treated as UNKNOWN (no adult scores).
    const confirmed = ageConfirmationCurrent({
      ageConfirmed: record.age_confirmed,
      ageConfirmedAt: record.age_confirmed_at,
    });
    if (!confirmed) {
      return { declared: true, age: null, owned: true, dependentId: ref.dependentId };
    }
    const age = ageFromBirthYear(record.birth_year, record.birth_month);
    return { declared: true, age, owned: true, dependentId: ref.dependentId };
  } catch (error) {
    // A missing dependents table (42P01) or any lookup failure must not let a
    // score through: report the dependant as unknown age, still owned (so the
    // request is gated, not rejected as forged).
    if (error?.code === '42P01') {
      return { declared: true, age: null, owned: true, dependentId: ref.dependentId };
    }
    throw error;
  }
}
