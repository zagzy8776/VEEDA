import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateNews2, calculateQsofa } from '../clinical-scoring.js';

test('NEWS2 scores normal complete observations as 0 low risk', () => {
  const result = calculateNews2({
    respiratoryRate: 16,
    oxygenSaturation: 98,
    supplementalOxygen: false,
    temperature: 37,
    systolicBp: 120,
    heartRate: 70,
    consciousness: 'alert',
  });
  assert.equal(result.total, 0);
  assert.equal(result.urgency.level, 'Low Risk');
  assert.equal(result.complete, true);
});

test('NEWS2 applies SpO2 scale 2 thresholds', () => {
  assert.equal(calculateNews2({ oxygenSaturation: 88, spo2Scale: 2 }).components.oxygenSaturation, 0);
  assert.equal(calculateNews2({ oxygenSaturation: 97, spo2Scale: 2 }).components.oxygenSaturation, 3);
  assert.equal(calculateNews2({ oxygenSaturation: 91, spo2Scale: 1 }).components.oxygenSaturation, 3);
});

test('NEWS2 handles max threshold values and high risk urgency', () => {
  const result = calculateNews2({
    respiratoryRate: 25,
    oxygenSaturation: 91,
    supplementalOxygen: true,
    temperature: 39.1,
    systolicBp: 220,
    heartRate: 131,
    consciousness: 'new_confusion',
  });
  assert.equal(result.total, 19);
  assert.equal(result.urgency.level, 'High Risk');
});

test('NEWS2 reports missing data instead of pretending score is complete', () => {
  const result = calculateNews2({ heartRate: 80 });
  assert.equal(result.complete, false);
  assert.ok(result.missing.includes('respiratoryRate'));
  assert.equal(result.urgency.level, 'Incomplete');
});

test('NEWS2 rejects non-physiological inputs', () => {
  assert.throws(() => calculateNews2({ heartRate: 500 }), /heartRate out of physiological bounds/);
  assert.throws(() => calculateNews2({ oxygenSaturation: 130 }), /oxygenSaturation out of physiological bounds/);
});

test('qSOFA flags sepsis risk at score 2 or greater', () => {
  const result = calculateQsofa({ respiratoryRate: 24, systolicBp: 95, consciousness: 'alert' });
  assert.equal(result.total, 2);
  assert.equal(result.sepsisRiskFlag, true);
  assert.equal(result.urgency.level, 'High Risk');
});

test('qSOFA reports incomplete when required observations are missing', () => {
  const result = calculateQsofa({ consciousness: 'alert' });
  assert.equal(result.complete, false);
  assert.equal(result.urgency.level, 'Incomplete');
});
