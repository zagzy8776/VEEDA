import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateNews2, calculateQsofa } from '../clinical-scoring.js';

const completeNormal = {
  respiratoryRate: 16,
  oxygenSaturation: 98,
  supplementalOxygen: false,
  temperature: 37,
  systolicBp: 120,
  heartRate: 70,
  consciousness: 'alert',
};

test('NEWS2 scores normal complete observations as 0 low risk', () => {
  const result = calculateNews2(completeNormal);
  assert.equal(result.total, 0);
  assert.equal(result.urgency.level, 'Low Risk');
  assert.equal(result.complete, true);
});

test('NEWS2 Scale 2 scores 93-94 as 0 without supplemental oxygen', () => {
  assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation: 93, spo2Scale: 2 }).components.oxygenSaturation, 0);
  assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation: 94, spo2Scale: 2 }).components.oxygenSaturation, 0);
});

test('NEWS2 Scale 2 changes 93-94 scoring when supplemental oxygen is present', () => {
  assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation: 93, spo2Scale: 2, supplementalOxygen: true }).components.oxygenSaturation, 1);
  assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation: 94, spo2Scale: 2, supplementalOxygen: true }).components.oxygenSaturation, 1);
});

test('NEWS2 applies Scale 2 low and high thresholds', () => {
  assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation: 83, spo2Scale: 2 }).components.oxygenSaturation, 3);
  assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation: 84, spo2Scale: 2 }).components.oxygenSaturation, 2);
  assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation: 86, spo2Scale: 2 }).components.oxygenSaturation, 1);
  assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation: 88, spo2Scale: 2 }).components.oxygenSaturation, 0);
  assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation: 97, spo2Scale: 2 }).components.oxygenSaturation, 0);
  assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation: 97, spo2Scale: 2, supplementalOxygen: true }).components.oxygenSaturation, 3);
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

test('NEWS2 temperature decimal boundary is handled by observation rounding', () => {
  assert.equal(calculateNews2({ ...completeNormal, temperature: 36.05 }).components.temperature, 0);
  assert.equal(calculateNews2({ ...completeNormal, temperature: 36.04 }).components.temperature, 0);
});

test('qSOFA flags sepsis risk at score 2 or greater', () => {
  const result = calculateQsofa({ respiratoryRate: 24, systolicBp: 95, consciousness: 'alert' });
  assert.equal(result.total, 2);
  assert.equal(result.sepsisRiskFlag, true);
  assert.equal(result.urgency.level, 'High Risk');
});

test('qSOFA boundary values are scored correctly', () => {
  assert.equal(calculateQsofa({ respiratoryRate: 21, systolicBp: 101, consciousness: 'alert' }).total, 0);
  assert.equal(calculateQsofa({ respiratoryRate: 22, systolicBp: 101, consciousness: 'alert' }).total, 1);
  assert.equal(calculateQsofa({ respiratoryRate: 21, systolicBp: 100, consciousness: 'alert' }).total, 1);
  assert.equal(calculateQsofa({ respiratoryRate: 22, systolicBp: 100, consciousness: 'alert' }).total, 2);
  assert.equal(calculateQsofa({ respiratoryRate: 22, systolicBp: 100, consciousness: 'new_confusion' }).total, 3);
});

test('qSOFA reports incomplete when required observations are missing', () => {
  const result = calculateQsofa({ consciousness: 'alert' });
  assert.equal(result.complete, false);
  assert.equal(result.urgency.level, 'Incomplete');
});
