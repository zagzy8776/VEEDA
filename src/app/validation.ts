// Validation harness (Phase 9).
//
// A reusable harness that computes error range, sensitivity and specificity for a
// detector/model against a doctor-reviewed case set, and a format for those case
// sets. The numbers here are DERIVED from the cases provided; nothing is assumed.
//
// It also encodes the model-update controls: a model may only be promoted when its
// validation meets the acceptance thresholds, and promotion is an explicit, pinned
// action — never automatic drift.

import type { MlTask, ValidationRecord } from './modelRegistry.ts';

export interface CaseSetMetadata {
  id: string;
  version: string;
  /** Name/role of the clinician who reviewed the cases. */
  reviewer: string;
  reviewerCredential?: string;
  /** ISO date of the review. */
  reviewDate: string;
  region: string;
  /** Sub-populations the cases cover, e.g. skin tone bands or conditions. */
  stratifiers: string[];
}

export interface ValidationCase {
  id: string;
  /** The known truth from the reviewer (gold standard). */
  truth: boolean;
  /** What the system under test produced. `null` means it gave no result. */
  predicted: boolean | null;
  /** Optional stratifier label for sub-group reporting, e.g. "skin_tone_V". */
  stratum?: string;
}

export interface HarnessResult {
  cases: number;
  /** Cases the system actually decided (predicted !== null). */
  decided: number;
  sensitivity: number;
  specificity: number;
  /** Share of cases where the system gave no result. */
  abstentionRate: number;
  /** Per-stratum sensitivity/specificity, for skin-tone / condition reporting. */
  byStratum: Record<string, { sensitivity: number; specificity: number; cases: number }>;
  /** The acceptance thresholds this result should be compared against. */
  meetsAcceptance: (minSensitivity: number, minSpecificity: number) => boolean;
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** Run the harness over a case set. Points with no prediction count as abstentions. */
export function runHarness(cases: ValidationCase[]): HarnessResult {
  const decided = cases.filter(c => c.predicted !== null);
  const positives = decided.filter(c => c.truth === true);
  const negatives = decided.filter(c => c.truth === false);
  const truePositives = positives.filter(c => c.predicted === true).length;
  const trueNegatives = negatives.filter(c => c.predicted === false).length;

  const strata = new Map<string, ValidationCase[]>();
  for (const c of decided) {
    if (!c.stratum) continue;
    strata.set(c.stratum, [...(strata.get(c.stratum) ?? []), c]);
  }
  const byStratum: HarnessResult['byStratum'] = {};
  for (const [name, group] of strata) {
    const pos = group.filter(c => c.truth === true);
    const neg = group.filter(c => c.truth === false);
    byStratum[name] = {
      sensitivity: rate(pos.filter(c => c.predicted === true).length, pos.length),
      specificity: rate(neg.filter(c => c.predicted === false).length, neg.length),
      cases: group.length,
    };
  }

  const sensitivity = rate(truePositives, positives.length);
  const specificity = rate(trueNegatives, negatives.length);
  return {
    cases: cases.length,
    decided: decided.length,
    sensitivity,
    specificity,
    abstentionRate: rate(cases.length - decided.length, cases.length),
    byStratum,
    meetsAcceptance: (minS, minSp) => sensitivity >= minS && specificity >= minSp,
  };
}

/**
 * Build the ValidationRecord a registry needs from a harness result and an error
 * range string. It refuses to build a record that does not meet acceptance.
 */
export function toValidationRecord(
  result: HarnessResult,
  meta: CaseSetMetadata,
  errorRange: string,
  acceptance: { minSensitivity: number; minSpecificity: number },
): ValidationRecord | null {
  if (!result.meetsAcceptance(acceptance.minSensitivity, acceptance.minSpecificity)) return null;
  return {
    errorRange,
    sensitivity: result.sensitivity,
    specificity: result.specificity,
    reference: `${meta.id}@${meta.version} (${meta.reviewer}, ${meta.reviewDate})`,
    validatedAt: meta.reviewDate,
  };
}

export interface PromotionDecision {
  promote: boolean;
  reason: string;
}

/**
 * Model-update control: a new version may be promoted only when it meets acceptance
 * AND the caller pins it explicitly. There is no automatic promotion.
 */
export function promotionDecision(
  task: MlTask,
  result: HarnessResult,
  acceptance: { minSensitivity: number; minSpecificity: number },
  pinned: boolean,
): PromotionDecision {
  if (!result.meetsAcceptance(acceptance.minSensitivity, acceptance.minSpecificity)) {
    return { promote: false, reason: `${task} did not meet the acceptance thresholds; keep the current version.` };
  }
  if (!pinned) {
    return { promote: false, reason: `${task} meets thresholds but is not pinned for release; promotion must be explicit.` };
  }
  return { promote: true, reason: `${task} meets thresholds and is pinned for release.` };
}
