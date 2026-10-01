// Intake gate, red-flag referral and explainable results (Phase 7).
//
// The AI-doctor flow is: intake FIRST, then a red-flag check, then advice. No advice
// is produced before intake. Every result carries its own explanation (inputs, their
// sources, and the pack that produced any wording) so nothing is a black box.
//
// This module contains no clinical content: the red-flag referral decision itself is
// made by the existing referral/prevention engines from packs. This only enforces the
// ORDER and builds the explanation.

export interface IntakeAnswers {
  [questionId: string]: string | number | boolean | null | undefined;
}

export interface IntakeGate {
  complete: boolean;
  missing: string[];
}

/** Intake is complete only when every required question has a non-empty answer. */
export function intakeGate(
  questions: { id: string; required?: boolean }[],
  answers: IntakeAnswers,
): IntakeGate {
  const missing: string[] = [];
  for (const q of questions) {
    if (!q.required) continue;
    const value = answers[q.id];
    if (value == null || value === '') missing.push(q.id);
  }
  return { complete: missing.length === 0, missing };
}

export type AdviceState =
  | { state: 'blocked'; reason: string }
  | { state: 'refer'; reason: string }
  | { state: 'advise'; message: string; advice?: string; reviewedBy?: string };

export interface AdviceInputs {
  intake: IntakeGate;
  /** Result of the red-flag referral engine (from packs). */
  referral: { redFlag: boolean; message?: string; advice?: string; reviewedBy?: string; state: string };
}

/**
 * Decide whether advice may be produced. Order is enforced:
 *   1. intake must be complete, or advice is blocked;
 *   2. a red-flag referral must be surfaced as a referral, not as advice;
 *   3. otherwise the pack's advice is returned WITH its provenance.
 */
export function adviceFor(inputs: AdviceInputs): AdviceState {
  if (!inputs.intake.complete) {
    return { state: 'blocked', reason: 'Answer the intake questions first; advice is not given before intake.' };
  }
  if (inputs.referral.state === 'unavailable') {
    return { state: 'refer', reason: 'No approved guidance pack is loaded, so get medical help if you feel unwell.' };
  }
  if (inputs.referral.redFlag) {
    return { state: 'refer', reason: inputs.referral.message || 'Your answers matched a red flag. Get medical help now.' };
  }
  if (!inputs.referral.message) {
    return { state: 'refer', reason: 'No approved advice is available. Get medical help if you feel unwell.' };
  }
  return {
    state: 'advise',
    message: inputs.referral.message,
    advice: inputs.referral.advice,
    reviewedBy: inputs.referral.reviewedBy,
  };
}

export interface ExplanationItem {
  id: string;
  label: string;
  value: string | number | boolean;
  source: string;
}

export interface ExplainableResult {
  /** Each input that fed the result, with where it came from. */
  inputs: ExplanationItem[];
  /** The pack provenance, when a pack produced wording. */
  reviewedBy?: string;
  /** The model version, when a validated model produced a value. */
  modelVersion?: string;
  /** Plain disclaimer, always present. */
  disclaimer: string;
}

/** Build the explanation attached to every user-facing result. */
export function explainResult(
  inputs: ExplanationItem[],
  opts: { reviewedBy?: string; modelVersion?: string } = {},
): ExplainableResult {
  return {
    inputs,
    reviewedBy: opts.reviewedBy,
    modelVersion: opts.modelVersion,
    disclaimer: 'Early warning / screening, not a diagnosis.',
  };
}
