// Mental-health check-ins and gated crisis referral (Phase 4).
//
// Check-in questions come from a reviewed pack. The crisis-referral step is
// GATED OFF in production until a reviewed pack with VERIFIED numbers exists:
// `resolveFlag('mentalHealthCrisis', ...)` must be enabled before any crisis
// number is shown. When it is off the user sees a plain line telling them to get
// help now — never a blank screen and never an unverified number.

import { validateContentPack, type ContentPackMeta } from './contentPack.ts';
import { resolveFlag, type FlagContext } from './featureFlags.ts';
import { notAvailableLine } from './packText.ts';

export interface CheckInQuestion {
  id: string;
  prompt: string;
  type: 'yes_no' | 'scale' | 'select' | 'text';
  options?: string[];
}

export interface CheckInPack {
  meta: ContentPackMeta;
  questions: CheckInQuestion[];
}

export interface CrisisReferral {
  /** Verified crisis numbers, only ever present in a reviewed pack. */
  numbers: { label: string; number: string }[];
  /** Pack wording for the referral screen. */
  message: string;
}

export type CheckInResult =
  | { ok: true; pack: CheckInPack }
  | { ok: false; reason: string };

const TYPES: CheckInQuestion['type'][] = ['yes_no', 'scale', 'select', 'text'];

function isValidQuestion(value: unknown): value is CheckInQuestion {
  if (!value || typeof value !== 'object') return false;
  const q = value as Record<string, unknown>;
  if (typeof q.id !== 'string' || !q.id.trim()) return false;
  if (typeof q.prompt !== 'string' || !q.prompt.trim()) return false;
  if (typeof q.type !== 'string' || !TYPES.includes(q.type as CheckInQuestion['type'])) return false;
  if (q.type === 'select' && (!Array.isArray(q.options) || q.options.length === 0)) return false;
  return true;
}

export function loadCheckInPack(raw: unknown, options: { production?: boolean } = {}): CheckInResult {
  const validated = validateContentPack<unknown[]>(raw, { production: options.production, label: 'check-in pack' });
  if (validated.ok === false) return { ok: false, reason: validated.reason };
  const questions: CheckInQuestion[] = [];
  for (const entry of validated.pack.entries) {
    if (!isValidQuestion(entry)) return { ok: false, reason: 'check-in pack contains an invalid question' };
    questions.push(entry);
  }
  return { ok: true, pack: { meta: validated.pack.meta, questions } };
}

export interface CrisisReferralState {
  available: boolean;
  reason: string;
  /** Present only when `available` is true. */
  referral?: CrisisReferral;
}

/**
 * Resolve the crisis-referral step. It is available ONLY when the gated flag is
 * enabled (which itself requires a reviewed pack + verified numbers in
 * production). Otherwise a plain help line is returned and no number is shown.
 */
export function resolveCrisisReferral(
  pack: CrisisReferral | null,
  flagContext: FlagContext,
  emergencyNumber?: string | null,
): CrisisReferralState {
  const flag = resolveFlag('mentalHealthCrisis', {
    ...flagContext,
    // The pack itself is the configuration proof: no pack => not configured.
    configured: flagContext.configured ?? Boolean(pack && pack.numbers.length > 0),
  });
  if (!flag.enabled || !pack || pack.numbers.length === 0) {
    return {
      available: false,
      reason: `${notAvailableLine(emergencyNumber)} A verified crisis pack is not configured.`,
    };
  }
  return { available: true, reason: 'enabled', referral: pack };
}
