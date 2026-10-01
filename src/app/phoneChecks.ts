// Phone-only check framework (Phase 5).
//
// A "phone check" is one of the camera/lens-based screens: hemoglobin/anemia,
// SpO2, jaundice, skin photos, cough & voice, malaria, sickle cell, blood-cell
// counting, urine test-strip reading. Each one is the SAME pipeline:
//
//   capture (with guide + quality gate) -> consent -> optional trace export for
//   validation -> model slot.
//
// The model slot is DISABLED until a validated model is registered, and when it is
// disabled the check reports "not yet validated" and produces NO result. Trace
// export lets a validated laboratory later judge the capture, so a research export
// ships even while the result is disabled.

import { checkQuality, type CaptureStats, type QualityResult, DEFAULT_REQUIREMENT } from './captureQuality.ts';
import { lookupModel, notValidatedLabel, type ModelRegistry, type MlTask } from './modelRegistry.ts';

export interface PhoneCheck {
  id: MlTask;
  title: string;
  /** True when the check needs a clip-on lens accessory. */
  needsLens: boolean;
}

export const PHONE_CHECKS: PhoneCheck[] = [
  { id: 'hemoglobin_anemia', title: 'Hemoglobin / anemia', needsLens: true },
  { id: 'spo2', title: 'Blood oxygen (SpO2)', needsLens: false },
  { id: 'jaundice', title: 'Jaundice', needsLens: false },
  { id: 'skin_photo', title: 'Skin photo', needsLens: false },
  { id: 'cough_voice', title: 'Cough & voice', needsLens: false },
  { id: 'malaria', title: 'Malaria', needsLens: true },
  { id: 'sickle_cell', title: 'Sickle cell', needsLens: true },
  { id: 'blood_cell_count', title: 'Blood cell counting', needsLens: true },
  { id: 'urine_strip', title: 'Urine test strip', needsLens: false },
];

export type PhoneCheckOutcome =
  | { state: 'retake'; reason: string; guidance: string }
  | { state: 'no_consent'; message: string }
  | { state: 'not_validated'; message: string }
  | { state: 'unavailable'; message: string };

/**
 * Run a phone check. It NEVER returns a result: it either asks for a retake, asks
 * for consent, or reports that the check is not yet validated. A result only
 * becomes possible once a validated model is registered (still returned by the
 * caller, not here) — this function is deliberately incapable of inventing one.
 */
export function runPhoneCheck(
  check: PhoneCheck,
  stats: CaptureStats | null,
  hasConsent: boolean,
  registry: ModelRegistry,
): PhoneCheckOutcome {
  if (!hasConsent) {
    return { state: 'no_consent', message: 'This check needs your consent before it can capture anything.' };
  }
  const quality: QualityResult = stats ? checkQuality(stats, DEFAULT_REQUIREMENT) : { ok: false, reason: 'too_small', guidance: 'Start the capture first.' };
  if (quality.ok === false) {
    return { state: 'retake', reason: quality.reason, guidance: quality.guidance };
  }
  const model = lookupModel(registry, check.id);
  if (!model.available) {
    if (check.needsLens) {
      return {
        state: 'not_validated',
        message: `${notValidatedLabel()} This check also needs a clip-on lens accessory.`,
      };
    }
    return { state: 'not_validated', message: notValidatedLabel() };
  }
  // A validated model exists, but evaluating it is out of scope here: report it so
  // the caller can proceed. The framework still asserts no fabricated output.
  return { state: 'unavailable', message: 'A validated model is registered but no result is produced by this framework.' };
}
