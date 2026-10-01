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

test('NEWS2 scores respiratory-rate boundaries according to the RCP chart', () => {
  const expected = new Map([
    [8, 3], [9, 1], [11, 1], [12, 0], [20, 0], [21, 2], [24, 2], [25, 3],
  ]);
  for (const [respiratoryRate, score] of expected) {
    assert.equal(calculateNews2({ ...completeNormal, respiratoryRate }).components.respiration, score);
  }
});

test('NEWS2 Scale 1 scores oxygen-saturation boundaries according to the RCP chart', () => {
  const expected = new Map([
    [91, 3], [92, 2], [93, 2], [94, 1], [95, 1], [96, 0],
  ]);
  for (const [oxygenSaturation, score] of expected) {
    assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation, spo2Scale: 1 }).components.oxygenSaturation, score);
  }
});

test('NEWS2 Scale 2 scores air boundaries according to the RCP chart', () => {
  // RCP SpO2 Scale 2 on air: <=83 -> 3, 84-85 -> 2, 86-87 -> 1, >=88 -> 0.
  const expected = new Map([
    [83, 3], [84, 2], [85, 2], [86, 1], [87, 1], [88, 0], [92, 0], [93, 0], [94, 0], [95, 0], [96, 0], [97, 0],
  ]);
  for (const [oxygenSaturation, score] of expected) {
    assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation, spo2Scale: 2 }).components.oxygenSaturation, score);
  }
});

test('NEWS2 Scale 2 scores on-oxygen boundaries according to the RCP chart', () => {
  // RCP SpO2 Scale 2 on oxygen: 86-87 always scores 1 (not oxygen-conditioned);
  // only the >=93 bands are oxygen-conditioned: 93-94 -> 1, 95-96 -> 2, >=97 -> 3.
  const expected = new Map([
    [83, 3], [84, 2], [85, 2], [86, 1], [87, 1], [88, 0], [92, 0], [93, 1], [94, 1], [95, 2], [96, 2], [97, 3],
  ]);
  for (const [oxygenSaturation, score] of expected) {
    assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation, spo2Scale: 2, supplementalOxygen: true }).components.oxygenSaturation, score);
  }
});

test('NEWS2 Scale 2 scores 86-87 as 1 regardless of supplemental oxygen', () => {
  for (const oxygenSaturation of [86, 87]) {
    assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation, spo2Scale: 2 }).components.oxygenSaturation, 1);
    assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation, spo2Scale: 2, supplementalOxygen: true }).components.oxygenSaturation, 1);
  }
});

test('NEWS2 adds the independent supplemental-oxygen score', () => {
  assert.equal(calculateNews2({ ...completeNormal, supplementalOxygen: false }).components.supplementalOxygen, 0);
  assert.equal(calculateNews2({ ...completeNormal, supplementalOxygen: true }).components.supplementalOxygen, 2);
});

test('NEWS2 applies Scale 2 low and high thresholds', () => {
  assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation: 83, spo2Scale: 2 }).components.oxygenSaturation, 3);
  assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation: 84, spo2Scale: 2 }).components.oxygenSaturation, 2);
  assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation: 86, spo2Scale: 2 }).components.oxygenSaturation, 1);
  assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation: 88, spo2Scale: 2 }).components.oxygenSaturation, 0);
  assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation: 97, spo2Scale: 2 }).components.oxygenSaturation, 0);
  assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation: 97, spo2Scale: 2, supplementalOxygen: true }).components.oxygenSaturation, 3);
  // Regression: 86-87% on supplemental oxygen must score 1, never 0.
  assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation: 86, spo2Scale: 2, supplementalOxygen: true }).components.oxygenSaturation, 1);
  assert.equal(calculateNews2({ ...completeNormal, oxygenSaturation: 87, spo2Scale: 2, supplementalOxygen: true }).components.oxygenSaturation, 1);
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

test('NEWS2 scores systolic-blood-pressure boundaries according to the RCP chart', () => {
  const expected = new Map([
    [90, 3], [91, 2], [100, 2], [101, 1], [110, 1], [111, 0], [219, 0], [220, 3],
  ]);
  for (const [systolicBp, score] of expected) {
    assert.equal(calculateNews2({ ...completeNormal, systolicBp }).components.systolicBp, score);
  }
});

test('NEWS2 scores pulse boundaries according to the RCP chart', () => {
  const expected = new Map([
    [40, 3], [41, 1], [50, 1], [51, 0], [90, 0], [91, 1], [110, 1], [111, 2], [130, 2], [131, 3],
  ]);
  for (const [heartRate, score] of expected) {
    assert.equal(calculateNews2({ ...completeNormal, heartRate }).components.heartRate, score);
  }
});

test('NEWS2 scores alert and CVPU consciousness states', () => {
  assert.equal(calculateNews2({ ...completeNormal, consciousness: 'alert' }).components.consciousness, 0);
  for (const consciousness of ['new_confusion', 'voice', 'pain', 'unresponsive']) {
    assert.equal(calculateNews2({ ...completeNormal, consciousness }).components.consciousness, 3);
  }
});

test('NEWS2 rejects non-physiological inputs', () => {
  assert.throws(() => calculateNews2({ heartRate: 500 }), /heartRate out of physiological bounds/);
  assert.throws(() => calculateNews2({ oxygenSaturation: 130 }), /oxygenSaturation out of physiological bounds/);
});

test('NEWS2 temperature decimal boundary is handled by observation rounding', () => {
  assert.equal(calculateNews2({ ...completeNormal, temperature: 36.05 }).components.temperature, 0);
  assert.equal(calculateNews2({ ...completeNormal, temperature: 36.04 }).components.temperature, 1);
  assert.equal(calculateNews2({ ...completeNormal, temperature: 38.05 }).components.temperature, 1);
  assert.equal(calculateNews2({ ...completeNormal, temperature: 38.04 }).components.temperature, 0);
});

test('NEWS2 temperature boundaries match the RCP chart after one-decimal rounding', () => {
  const expected = new Map([
    [35.0, 3], [35.04, 3], [35.05, 1], [35.1, 1],
    [36.0, 1], [36.04, 1], [36.05, 0], [36.1, 0],
    [38.0, 0], [38.04, 0], [38.05, 1], [38.1, 1],
    [39.0, 1], [39.04, 1], [39.05, 2], [39.1, 2],
  ]);
  for (const [temperature, score] of expected) {
    assert.equal(calculateNews2({ ...completeNormal, temperature }).components.temperature, score);
  }
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
