// Audio-distress detection framework (Phase 2).
//
// A foreground-only microphone watch that may, once a validated classifier
// exists, notice sounds like a scream or a fall-related crash and ask
// "Are you okay?". VEEDA ships NO classifier and NO thresholds. What ships is
// the FRAMEWORK:
//
//   - a spectral feature extractor (the browser's AnalyserNode does the FFT;
//     this module only summarises the spectrum it is given),
//   - a watch state machine that requires SEVERAL consecutive positive
//     classifications before reacting, so one loud film scene can never page
//     anyone, and
//   - the escalation ladder as the ONLY response path: a detection starts a
//     check-in, never a call.
//
// Fails safe, in order:
//   1. No microphone consent         -> disabled.
//   2. Not enabled in configuration  -> disabled.
//   3. No validated model registered -> unavailable ("not yet validated").
//   4. All three pass                -> ready; the caller MUST route any trigger
//      through startLadder() from escalation.ts. The watch never dials,
//      messages, or reaches SOS by itself.
//
// Pure module: no Web Audio, no storage, no timers, so it is fully unit
// testable. The browser adapter feeds AnalyserNode spectra in as Float32Array
// magnitude frames; tests feed synthetic spectra.

import type { ModelLookup } from './modelRegistry.ts';

/** Features summarising one spectrum frame. Plain numbers a classifier reads. */
export interface AudioFeatures {
  /** Spectral RMS of the frame (magnitude scale, 0 when silent). */
  rms: number;
  /** Fraction of the frame's energy in the upper half of the spectrum (0..1). */
  highRatio: number;
}

/**
 * Summarise one magnitude spectrum (e.g. from AnalyserNode.getFloatFrequencyData
 * rescaled to magnitudes). Negative or non-finite bins are clamped to zero.
 */
export function extractAudioFeatures(spectrum: Float32Array): AudioFeatures {
  let total = 0;
  let high = 0;
  const half = Math.floor(spectrum.length / 2);
  for (let i = 0; i < spectrum.length; i++) {
    const v = spectrum[i];
    const mag = Number.isFinite(v) && v > 0 ? v : 0;
    const power = mag * mag;
    total += power;
    if (i >= half) high += power;
  }
  return {
    rms: Math.sqrt(total / Math.max(1, spectrum.length)),
    highRatio: total > 0 ? high / total : 0,
  };
}

/**
 * A classifier decides from features. `null` means "cannot decide" and is
 * NEVER a trigger. VEEDA ships no classifier; one is injected only after a
 * validated model is registered for the `audio_distress` task.
 */
export type AudioClassifier = (features: AudioFeatures) => boolean | null;

export interface AudioWatchConfig {
  /** False by default; the watch does nothing until this is explicitly true. */
  enabled: boolean;
  /**
   * Consecutive positive classifications required before the watch reacts.
   * Structural anti-false-positive rule, not a clinical threshold. Default 2;
   * a single loud moment can never trigger on its own.
   */
  requiredConfirmations?: number;
}

export interface AudioWatchState {
  consecutive: number;
}

export function createAudioWatchState(): AudioWatchState {
  return { consecutive: 0 };
}

export interface AudioWatchUpdate {
  state: AudioWatchState;
  triggered: boolean;
}

/**
 * Feed one frame's features into the watch. Only `true` verdicts advance the
 * streak; `false` (not distress) and `null` (cannot decide) both reset it —
 * the conservative choice against false positives. The watch reacts only after
 * `requiredConfirmations` consecutive positive verdicts.
 */
export function updateAudioWatch(
  state: AudioWatchState,
  features: AudioFeatures,
  config: AudioWatchConfig,
  classifier: AudioClassifier,
): AudioWatchUpdate {
  if (classifier(features) !== true) {
    return { state: { consecutive: 0 }, triggered: false };
  }
  const required = Math.max(1, config.requiredConfirmations ?? 2);
  const consecutive = state.consecutive + 1;
  return { state: { consecutive }, triggered: consecutive >= required };
}

export type AudioDistressOutcome =
  | { state: 'disabled'; triggered: false; reason: string }
  | { state: 'unavailable'; triggered: false; reason: string }
  | { state: 'ready'; triggered: false; reason: string };

const EARLY_WARNING = 'Early warning only, not a diagnosis.';

/**
 * Report whether the audio watch may run at all, and why not. This NEVER
 * reports a detection — it is the gate chain only. A `ready` result still
 * requires a validated classifier at runtime, and any trigger goes through the
 * escalation ladder's check-in rung first.
 */
export function evaluateAudioDistress(input: {
  micConsented: boolean;
  config?: AudioWatchConfig;
  model: ModelLookup;
}): AudioDistressOutcome {
  const model = input.model;
  if (!input.micConsented) {
    return { state: 'disabled', triggered: false, reason: 'microphone consent has not been granted' };
  }
  if (!input.config || input.config.enabled !== true) {
    return { state: 'disabled', triggered: false, reason: 'audio distress detection is not enabled on this deployment' };
  }
  if (model.available === false) {
    return { state: 'unavailable', triggered: false, reason: model.reason };
  }
  return {
    state: 'ready',
    triggered: false,
    reason: `${EARLY_WARNING} A detection only starts the check-in ladder.`,
  };
}
