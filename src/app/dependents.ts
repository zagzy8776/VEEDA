// Family profiles (dependants) and the age gate that keeps adult-only clinical
// scores off children.
//
// A dependant is a person the signed-in guardian manages from their own
// account. A dependant is never a user and is never linked to another account.
//
// IMPORTANT (clinical): NEWS2 and qSOFA are adult tools (widely documented as
// validated for people aged 16+ and not for pregnancy). If a dependant is below
// the adult cutoff, or their age is unknown, the app must NOT compute or show
// NEWS2, qSOFA, or adult blood-pressure interpretation for them — it says
// "not validated for children" instead. The cutoff is CONFIGURATION set by the
// deploying clinician, not a number baked into this module.

import type { StorageLike } from './consent.ts';

export interface Dependent {
  id: string;
  displayName: string;
  /** Optional. When absent the age gate treats the dependant as unknown. */
  age?: number | null;
}

/**
 * Default adult cutoff awarded by this build ONLY as a fallback. The deployment
 * overrides it via Vite env `VITE_ADULT_AGE_CUTOFF`. The clinician sets the real
 * value; this default exists so a child is never silently scored as an adult if
 * the env is missing.
 */
export const DEFAULT_ADULT_AGE_CUTOFF = 16;

/** The configured adult age cutoff. Reads the build-time env, else the default. */
export function adultAgeCutoff(): number {
  try {
    const override = (globalThis as { __veedaEnv?: Record<string, string | undefined> }).__veedaEnv;
    const env = override ?? (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const raw = env?.VITE_ADULT_AGE_CUTOFF;
    const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_ADULT_AGE_CUTOFF;
  } catch {
    return DEFAULT_ADULT_AGE_CUTOFF;
  }
}

export const CHILD_NOT_VALIDATED_NOTE = 'Not validated for children';

export type AgeBand = 'adult' | 'child' | 'unknown';

/** Classify an age against the configured cutoff. Unknown stays unknown. */
export function ageBand(age: number | null | undefined, cutoff: number = adultAgeCutoff()): AgeBand {
  if (age == null || !Number.isFinite(age)) return 'unknown';
  return age >= cutoff ? 'adult' : 'child';
}

/**
 * Whether adult-only clinical scores may be computed/shown for this age. True
 * only for a known adult. A child OR an unknown age returns false, so the app
 * shows CHILD_NOT_VALIDATED_NOTE instead of a score.
 */
export function adultScoresAllowed(age: number | null | undefined, cutoff: number = adultAgeCutoff()): boolean {
  return ageBand(age, cutoff) === 'adult';
}

// ── Header switcher state (who the readings are being recorded for) ──
// This is UI state only: it never changes who is signed in. It is stored per
// guardian so a shared device does not carry one person's selection to another.

const ACTIVE_SUBJECT_PREFIX = 'veda_active_subject:';

/** Per-user key holding which subject (owner or dependant) is selected. */
export function activeSubjectKey(guardianUserId: string): string {
  return `${ACTIVE_SUBJECT_PREFIX}${guardianUserId}`;
}

/** The sentinel for "the account owner" (no dependant). */
export const SELF_SUBJECT = 'self';

/** Read the selected subject id for this guardian; defaults to the owner. */
export function activeSubject(storage: StorageLike, guardianUserId: string): string {
  try {
    return storage.getItem(activeSubjectKey(guardianUserId)) || SELF_SUBJECT;
  } catch {
    return SELF_SUBJECT;
  }
}

/** Set the selected subject id. `SELF_SUBJECT` clears the override. */
export function setActiveSubject(storage: StorageLike, guardianUserId: string, subjectId: string): void {
  try {
    if (!subjectId || subjectId === SELF_SUBJECT) storage.removeItem(activeSubjectKey(guardianUserId));
    else storage.setItem(activeSubjectKey(guardianUserId), subjectId);
  } catch {}
}
