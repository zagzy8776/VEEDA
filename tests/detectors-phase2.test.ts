import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRegistry, lookupModel, isUsable, notValidatedLabel,
  type ModelRegistration,
} from '../src/app/modelRegistry.ts';
import {
  evaluateDetector, learnBaseline, replayDetector,
} from '../src/app/detectors.ts';

test('a task with no registered model is not_validated and gives no result', () => {
  const registry = buildRegistry([]);
  const look = lookupModel(registry, 'seizure_detection');
  assert.equal(look.available, false);
  if (!look.available) {
    assert.equal(look.state, 'not_validated');
    assert.match(look.reason, /not yet validated/i);
  }
  assert.match(notValidatedLabel(), /not a diagnosis/i);
});

test('a model below its own acceptance thresholds is treated as not validated', () => {
  const weak: ModelRegistration = {
    task: 'spo2', version: '0.1.0', approved: true,
    validation: { errorRange: 'n/a', sensitivity: 0.5, specificity: 0.5, reference: 'x', validatedAt: '2026-01-01' },
    acceptance: { minSensitivity: 0.9, minSpecificity: 0.9 },
  };
  assert.equal(isUsable(weak), false);
  assert.equal(lookupModel(buildRegistry([weak]), 'spo2').available, false);
});

test('an approved model meeting thresholds is available with a pinned version', () => {
  const good: ModelRegistration = {
    task: 'spo2', version: '1.2.0', approved: true,
    validation: { errorRange: '±2%', sensitivity: 0.95, specificity: 0.95, reference: 'study-1', validatedAt: '2026-01-01' },
    acceptance: { minSensitivity: 0.9, minSpecificity: 0.9 },
  };
  const look = lookupModel(buildRegistry([good]), 'spo2');
  assert.equal(look.available, true);
  if (look.available) assert.equal(look.version, '1.2.0');
});

test('an unapproved model is never usable', () => {
  const good: ModelRegistration = {
    task: 'malaria', version: '1.0.0', approved: false,
    validation: { errorRange: 'x', sensitivity: 1, specificity: 1, reference: 'x', validatedAt: '2026-01-01' },
    acceptance: { minSensitivity: 0.9, minSpecificity: 0.9 },
  };
  assert.equal(isUsable(good), false);
});

test('a detector is disabled with no config and never triggers', () => {
  const out = evaluateDetector('fall_detection', undefined, null);
  assert.equal(out.state, 'disabled');
  assert.equal(out.triggered, false);
});

test('a detector with no thresholds is disabled even when enabled=true', () => {
  const out = evaluateDetector('illness_drift', { enabled: true }, null);
  assert.equal(out.state, 'disabled');
  assert.match(out.reason, /no configured limits/i);
});

test('a detector with limits but no baseline is still learning, not alarming', () => {
  const out = evaluateDetector('illness_drift', { enabled: true, thresholds: { sigma: 3 } }, null);
  assert.equal(out.state, 'learning');
  assert.equal(out.triggered, false);
});

test('baseline learning needs a real learning window', () => {
  assert.equal(learnBaseline('resting_hr', [60, 62], { enabled: true, baselineDays: 10 }), null);
  const baseline = learnBaseline('resting_hr', Array(10).fill(60), { enabled: true, baselineDays: 10 });
  assert.ok(baseline);
  assert.equal(baseline?.mean, 60);
  assert.equal(baseline?.days, 10);
});

test('the replay harness reports a disabled detector as disabled, never scored', () => {
  const result = replayDetector('seizure_detection', undefined, [{ baseline: null }, { baseline: null }]);
  assert.equal(result.disabled, true);
  assert.equal(result.firedRate, 0);
  assert.match(result.notes, /disabled/i);
});
