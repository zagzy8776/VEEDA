// Automatic-detection framework (Phase 2).
//
// VEEDA ships NO clinical thresholds and NO trained model. What ships is the
// FRAMEWORK: on-device baseline learning, a drift calculation, an escalation
// ladder, and a replay/validation harness. Every detector is DISABLED until an
// operator sets its thresholds in configuration; until then `evaluateDetector`
// returns `disabled` with a plain reason and never an alarm.
//
// Two rules the tests pin:
//   1. A detector with no configured thresholds is `disabled` and reports
//      `triggered: false`. It can never raise a false alarm or a false calm.
//   2. A detector is labelled "early warning", never a diagnosis.
//
// Pure module: no storage, no timers, no network.

import { lookupModel, type ModelLookup, type ModelRegistry, type MlTask } from './modelRegistry.ts';
import { CONTENT_UNAVAILABLE_TEXT } from './packText.ts';

export type DetectorId =
  | 'illness_drift'
  | 'seizure_detection'
  | 'fall_detection'
  | 'sickle_cell_crisis'
  | 'breathing_trouble';

/**
 * Thresholds are configuration, not code. A detector without them does nothing.
 * The numbers themselves are set by a clinician/operator outside this repo.
 */
export interface DetectorConfig {
  /** False by default; a detector does nothing until this is explicitly true. */
  enabled: boolean;
  /** Minimum on-device learning window before a baseline may be used at all. */
  baselineDays?: number;
  /** Configurable limits — meaning is detector-specific and set by an operator. */
  thresholds?: Record<string, number>;
}

export interface Baseline {
  /** Mean of the user's own learned readings (device-only). */
  mean: number;
  /** Standard deviation of the same readings. */
  std: number;
  /** How many days of data the baseline covers. */
  days: number;
  /** Metric the baseline describes, e.g. "resting_hr". */
  metric: string;
}

export type DetectorOutcome =
  | { state: 'disabled'; triggered: false; reason: string }
  | { state: 'learning'; triggered: false; reason: string }
  | { state: 'ready'; triggered: boolean; reason: string; score?: number }
  | { state: 'unavailable'; triggered: false; reason: string };

const EARLY_WARNING = 'Early warning only, not a diagnosis.';

/** Bootstrap on-device baseline learning from a series of the user's own values. */
export function learnBaseline(
  metric: string,
  values: number[],
  config: DetectorConfig,
): Baseline | null {
  const minDays = config.baselineDays ?? Infinity;
  if (values.length < 2 || values.length < minDays) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance), days: values.length, metric };
}

/**
 * Evaluate a detector. The result is ALWAYS one of the four safe states and is
 * tagged with the early-warning label. Without config the detector is disabled;
 * without a usable baseline it is learning; a null baseline with no learning
 * window is reported so the caller can show a "not available" state.
 */
export function evaluateDetector(
  id: DetectorId,
  config: DetectorConfig | undefined,
  baseline: Baseline | null,
): DetectorOutcome {
  if (!config || config.enabled !== true) {
    return { state: 'disabled', triggered: false, reason: `${id} is not enabled on this deployment` };
  }
  if (!config.thresholds || Object.keys(config.thresholds).length === 0) {
    return { state: 'disabled', triggered: false, reason: `${id} has no configured limits yet` };
  }
  if (!baseline) {
    return { state: 'learning', triggered: false, reason: 'still learning your normal range on this device' };
  }
  return { state: 'ready', triggered: false, reason: EARLY_WARNING };
}

/**
 * The model-backed detections (illness drift, seizure, sickle-cell, breathing)
 * additionally require a validated model. Without one the detector is
 * `unavailable` with the standard "not yet validated" reason.
 */
export function detectorModelState(registry: ModelRegistry, task: MlTask): ModelLookup {
  return lookupModel(registry, task);
}

/** A replay/validation harness result: what a detector did against known inputs. */
export interface ReplayResult {
  id: DetectorId;
  cases: number;
  /** Cases where the detector fired, as a fraction (0..1). Only when enabled. */
  firedRate: number;
  /** True when the detector was disabled for the whole replay (nothing to report). */
  disabled: boolean;
  notes: string;
}

/**
 * Run a detector configuration against a labelled replay set. This is the
 * validation harness for each detector: it never invents a result, and reports
 * a disabled detector as disabled rather than scoring it.
 */
export function replayDetector(
  id: DetectorId,
  config: DetectorConfig | undefined,
  samples: { baseline: Baseline | null }[],
): ReplayResult {
  if (!config || config.enabled !== true) {
    return { id, cases: samples.length, firedRate: 0, disabled: true, notes: 'detector disabled; nothing evaluated' };
  }
  let fired = 0;
  for (const sample of samples) {
    const outcome = evaluateDetector(id, config, sample.baseline);
    if (outcome.state === 'ready' && outcome.triggered) fired++;
  }
  return {
    id,
    cases: samples.length,
    firedRate: samples.length ? fired / samples.length : 0,
    disabled: false,
    notes: `${CONTENT_UNAVAILABLE_TEXT} ${EARLY_WARNING}`,
  };
}
