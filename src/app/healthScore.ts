// Daily health score — NON-CLINICAL and fully transparent (Phase 4).
//
// This is NOT a diagnosis and NOT a clinical score. It is a simple, disclosed
// summary of how many of the user's OWN logged items are present and in a range
// the user or a reviewed pack set. The formula is printed to the user, every
// input is shown with its source, and missing inputs reduce the confidence rather
// than pretending a value exists.
//
// No clinical threshold is baked in here: the optional "in range" bounds arrive
// from a pack or the user's own targets. With no bounds the score is a plain
// completeness/summary number, clearly labelled as such.

import { EARLY_WARNING_LABEL } from './packText.ts';

export type ScoreSource = 'camera_estimate' | 'typed_in' | 'device';

export interface ScoreInput {
  id: string;
  label: string;
  value: number | null;
  source: ScoreSource;
  /** Optional inclusive range considered "in range". From a pack or user target. */
  range?: { min: number; max: number };
}

export interface ScoreComponent {
  id: string;
  label: string;
  source: ScoreSource;
  /** 1 when present and in range, 0.5 when present but out of range/unknown, 0 when missing. */
  points: number;
  detail: string;
}

export interface DailyHealthScore {
  /** 0..100, or null when there is nothing to score. Always non-clinical. */
  score: number | null;
  /** 0..1 share of inputs that had a real value. */
  confidence: number;
  components: ScoreComponent[];
  /** The formula, in plain language, always shown to the user. */
  formula: string;
  label: string;
}

const FORMULA =
  'Each logged item scores 1 if it is present and inside a range you or your pack set, '
  + 'half if it is present but outside or has no range, and 0 if it is missing. '
  + 'The score is the average of those, as a percentage.';

/**
 * Build the daily score. Fails safe: with no inputs it returns `score: null`, and
 * it never claims to be clinical.
 */
export function computeDailyHealthScore(inputs: ScoreInput[]): DailyHealthScore {
  const components: ScoreComponent[] = inputs.map(input => {
    if (input.value == null || Number.isNaN(input.value)) {
      return { id: input.id, label: input.label, source: input.source, points: 0, detail: 'not recorded' };
    }
    if (input.range) {
      const inRange = input.value >= input.range.min && input.value <= input.range.max;
      return {
        id: input.id, label: input.label, source: input.source,
        points: inRange ? 1 : 0.5,
        detail: inRange ? `in range (${input.range.min}–${input.range.max})` : `outside range (${input.range.min}–${input.range.max})`,
      };
    }
    return {
      id: input.id, label: input.label, source: input.source,
      points: 0.5, detail: 'recorded (no range set)',
    };
  });

  if (components.length === 0) {
    return {
      score: null, confidence: 0, components, formula: FORMULA,
      label: `Daily summary — non-clinical. ${EARLY_WARNING_LABEL}`,
    };
  }

  const recorded = components.filter(c => c.points > 0).length;
  const total = components.reduce((a, c) => a + c.points, 0);
  return {
    score: Math.round((total / components.length) * 100),
    confidence: recorded / components.length,
    components,
    formula: FORMULA,
    label: `Daily summary — non-clinical. ${EARLY_WARNING_LABEL}`,
  };
}
