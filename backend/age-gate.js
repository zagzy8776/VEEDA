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
 * Resolve the subject's age from an incoming request body.
 *
 * A request declares who the readings are for with `subject` (or, for
 * back-compat, a bare `age`/`dependentId` at the top level). The owner ("self")
 * is an adult by definition and the client sends no age for them, so a request
 * with NO subject information at all is treated as the account owner (adult).
 *
 * Returns `{ declared: boolean, age: number | null }`. `declared` is true only
 * when the request explicitly says the readings belong to a non-owner subject
 * (a dependant). Only a DECLARED subject is age-gated; an absent subject is the
 * signed-in owner.
 */
export function resolveSubject(body = {}) {
  const subject = body?.subject;
  if (subject && typeof subject === 'object') {
    const isOwner = subject.type === 'self' || subject.id === 'self';
    if (isOwner) return { declared: false, age: null };
    const age = subject.age == null ? null : Number(subject.age);
    return { declared: true, age: Number.isFinite(age) ? age : null };
  }
  // Back-compat: an explicit dependant id or age at the top level means a
  // non-owner subject whose age must be known and adult.
  if (body?.dependentId != null || body?.age != null) {
    const age = body.age == null ? null : Number(body.age);
    return { declared: true, age: Number.isFinite(age) ? age : null };
  }
  return { declared: false, age: null };
}
