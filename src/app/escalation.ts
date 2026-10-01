// Escalation ladder: check-in, then family call, then SOS.
//
// Shared by Phase 2 detectors (fall, seizure, no-response) and reused later.
// The ladder is a STATE MACHINE only: it decides which rung is next and what the
// user has not answered yet. It never dials by itself and never contains a
// number — the caller resolves the verified emergency number from config and the
// family contacts from the device store.
//
// Fails safe: the top rung is always "SOS" and the ladder never declares the
// user safe on its own.

export type LadderRung = 'check_in' | 'family_call' | 'sos';

export interface LadderState {
  rung: LadderRung;
  /** True once the user has answered the current check-in. */
  acknowledged: boolean;
  /** Milliseconds allowed on the current rung before it advances. */
  timeoutMs: number;
}

const RUNG_ORDER: LadderRung[] = ['check_in', 'family_call', 'sos'];

/**
 * The default timeouts are configuration, not clinical content; they only govern
 * how long the app waits before offering the next rung. They may be overridden
 * by the caller. They are deliberately plain UI timing, not a triage rule.
 */
export const DEFAULT_LADDER_TIMEOUT_MS: Record<LadderRung, number> = {
  check_in: 30_000,
  family_call: 30_000,
  sos: 0,
};

/** Start (or restart) the ladder at the check-in rung. */
export function startLadder(overrides?: Partial<Record<LadderRung, number>>): LadderState {
  return {
    rung: 'check_in',
    acknowledged: false,
    timeoutMs: overrides?.check_in ?? DEFAULT_LADDER_TIMEOUT_MS.check_in,
  };
}

/** Record that the user answered the current rung; the ladder is resolved. */
export function acknowledge(state: LadderState): LadderState {
  return { ...state, acknowledged: true };
}

/**
 * Advance the ladder after the current rung times out. Returns a new state; on
 * the SOS rung it stays put (SOS is the terminal rung and never downgrades).
 */
export function advance(state: LadderState, overrides?: Partial<Record<LadderRung, number>>): LadderState {
  if (state.acknowledged) return state; // resolved, do not escalate
  const index = RUNG_ORDER.indexOf(state.rung);
  const next = RUNG_ORDER[Math.min(index + 1, RUNG_ORDER.length - 1)];
  return {
    rung: next,
    acknowledged: false,
    timeoutMs: overrides?.[next] ?? DEFAULT_LADDER_TIMEOUT_MS[next],
  };
}

/** True when the ladder has reached the terminal SOS rung. */
export function isSos(state: LadderState): boolean {
  return state.rung === 'sos';
}

/**
 * Whether the standalone family/caregiver alert should fire: an unacknowledged
 * check-in that has escalated past the first rung. The caller decides how to
 * reach the caregiver (message), and never dials on the user's behalf.
 */
export function caregiverAlertDue(state: LadderState): boolean {
  return !state.acknowledged && RUNG_ORDER.indexOf(state.rung) >= 1;
}
