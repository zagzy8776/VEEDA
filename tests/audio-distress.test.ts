import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAudioFeatures, updateAudioWatch, createAudioWatchState,
  evaluateAudioDistress, type AudioWatchConfig, type AudioClassifier,
} from '../src/app/audioDistress.ts';
import { buildRegistry, lookupModel } from '../src/app/modelRegistry.ts';
import { startLadder, acknowledge, caregiverAlertDue } from '../src/app/escalation.ts';

function lowSpectrum(): Float32Array {
  const s = new Float32Array(8);
  s[0] = 3; s[1] = 4; // energy only in the lower half
  return s;
}

function highSpectrum(): Float32Array {
  const s = new Float32Array(8);
  s[6] = 3; s[7] = 4; // energy only in the upper half
  return s;
}

test('extractAudioFeatures: silence reports zero energy and zero ratio', () => {
  const f = extractAudioFeatures(new Float32Array(8));
  assert.equal(f.rms, 0);
  assert.equal(f.highRatio, 0);
});

test('extractAudioFeatures: splits energy between low and high bands', () => {
  const low = extractAudioFeatures(lowSpectrum());
  const high = extractAudioFeatures(highSpectrum());
  assert.equal(low.highRatio, 0);
  assert.equal(high.highRatio, 1);
  assert.ok(low.rms > 0 && high.rms > 0);
});

test('extractAudioFeatures: clamps negative and non-finite bins to zero', () => {
  const s = new Float32Array(8);
  s[0] = -5; s[1] = NaN; s[2] = Infinity; s[3] = 4;
  const f = extractAudioFeatures(s);
  // only bin 3 contributes
  const expected = Math.sqrt((4 * 4) / 8);
  assert.ok(Math.abs(f.rms - expected) < 1e-12);
  assert.equal(f.highRatio, 0);
});

function usableRegistry() {
  return buildRegistry([{
    task: 'audio_distress',
    version: '0.1.0-test',
    validation: {
      errorRange: 'test range', sensitivity: 0.9, specificity: 0.9,
      reference: 'test-study', validatedAt: '2026-01-01T00:00:00Z',
    },
    acceptance: { minSensitivity: 0.8, minSpecificity: 0.8 },
    approved: true,
  }]);
}

const enabledConfig: AudioWatchConfig = { enabled: true };

test('no microphone consent -> disabled, whatever else is configured', () => {
  const outcome = evaluateAudioDistress({
    micConsented: false,
    config: enabledConfig,
    model: lookupModel(usableRegistry(), 'audio_distress'),
  });
  assert.equal(outcome.state, 'disabled');
  assert.equal(outcome.triggered, false);
  assert.match(outcome.reason, /consent/);
});

test('consent but no config -> disabled even with a validated model', () => {
  const outcome = evaluateAudioDistress({
    micConsented: true,
    model: lookupModel(usableRegistry(), 'audio_distress'),
  });
  assert.equal(outcome.state, 'disabled');
  assert.match(outcome.reason, /not enabled/);
});

test('consent + config but no registered model -> unavailable (not yet validated)', () => {
  const outcome = evaluateAudioDistress({
    micConsented: true,
    config: enabledConfig,
    model: lookupModel(buildRegistry([]), 'audio_distress'),
  });
  assert.equal(outcome.state, 'unavailable');
  assert.equal(outcome.triggered, false);
  assert.match(outcome.reason, /not yet validated/);
});

test('consent + config + validated model -> ready, but still never a detection by itself', () => {
  const outcome = evaluateAudioDistress({
    micConsented: true,
    config: enabledConfig,
    model: lookupModel(usableRegistry(), 'audio_distress'),
  });
  assert.equal(outcome.state, 'ready');
  assert.equal(outcome.triggered, false);
});

test('the watch needs consecutive positive verdicts before it reacts', () => {
  const classifier: AudioClassifier = () => true;
  let state = createAudioWatchState();
  let update = updateAudioWatch(state, extractAudioFeatures(lowSpectrum()), enabledConfig, classifier);
  assert.equal(update.triggered, false); // one positive is never enough (default 2)
  update = updateAudioWatch(update.state, extractAudioFeatures(lowSpectrum()), enabledConfig, classifier);
  assert.equal(update.triggered, true);
});

test('a negative or undecided verdict resets the streak', () => {
  const yes: AudioClassifier = () => true;
  const no: AudioClassifier = () => false;
  const cant: AudioClassifier = () => null;
  let update = updateAudioWatch(createAudioWatchState(), extractAudioFeatures(lowSpectrum()), enabledConfig, yes);
  update = updateAudioWatch(update.state, extractAudioFeatures(lowSpectrum()), enabledConfig, no);
  assert.equal(update.state.consecutive, 0);
  update = updateAudioWatch(update.state, extractAudioFeatures(lowSpectrum()), enabledConfig, yes);
  assert.equal(update.triggered, false); // streak was reset
  update = updateAudioWatch(update.state, extractAudioFeatures(lowSpectrum()), enabledConfig, yes);
  assert.equal(update.triggered, true);
  update = updateAudioWatch(update.state, extractAudioFeatures(lowSpectrum()), enabledConfig, cant);
  assert.equal(update.state.consecutive, 0); // "cannot decide" also resets
});

test('requiredConfirmations is configuration, not a fixed rule', () => {
  const strict: AudioWatchConfig = { enabled: true, requiredConfirmations: 3 };
  const classifier: AudioClassifier = () => true;
  let update = updateAudioWatch(createAudioWatchState(), extractAudioFeatures(lowSpectrum()), strict, classifier);
  update = updateAudioWatch(update.state, extractAudioFeatures(lowSpectrum()), strict, classifier);
  assert.equal(update.triggered, false);
  update = updateAudioWatch(update.state, extractAudioFeatures(lowSpectrum()), strict, classifier);
  assert.equal(update.triggered, true);
});

test('a triggered watch only starts the check-in ladder; answering it stops escalation', () => {
  // This is the integration rule: detection -> startLadder, never a call.
  let ladder = startLadder();
  assert.equal(ladder.rung, 'check_in');
  assert.equal(caregiverAlertDue(ladder), false);
  ladder = acknowledge(ladder);
  assert.equal(caregiverAlertDue(ladder), false);
});
