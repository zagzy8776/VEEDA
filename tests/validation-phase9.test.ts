import test from 'node:test';
import assert from 'node:assert/strict';
import { runHarness, toValidationRecord, promotionDecision, type CaseSetMetadata } from '../src/app/validation.ts';

const meta: CaseSetMetadata = {
  id: 'spo2.cases', version: '1.0.0', reviewer: 'Dr. Test', reviewerCredential: 'Physician',
  reviewDate: '2026-01-01', region: 'NG', stratifiers: ['skin_tone_V'],
};

test('the harness reports sensitivity, specificity and abstention from the cases', () => {
  const result = runHarness([
    { id: '1', truth: true, predicted: true },   // TP
    { id: '2', truth: true, predicted: false },  // FN
    { id: '3', truth: false, predicted: false }, // TN
    { id: '4', truth: false, predicted: true },  // FP
    { id: '5', truth: true, predicted: null },   // abstain
  ]);
  assert.equal(result.cases, 5);
  assert.equal(result.decided, 4);
  assert.equal(result.sensitivity, 0.5); // 1 of 2
  assert.equal(result.specificity, 0.5); // 1 of 2
  assert.equal(result.abstentionRate, 0.2); // 1 of 5
});

test('the harness reports per-stratum results for skin-tone / condition reporting', () => {
  const result = runHarness([
    { id: '1', truth: true, predicted: true, stratum: 'skin_tone_V' },
    { id: '2', truth: false, predicted: false, stratum: 'skin_tone_V' },
    { id: '3', truth: true, predicted: false, stratum: 'skin_tone_VI' },
  ]);
  assert.equal(result.byStratum.skin_tone_V.sensitivity, 1);
  assert.equal(result.byStratum.skin_tone_V.specificity, 1);
  assert.equal(result.byStratum.skin_tone_VI.sensitivity, 0);
});

test('a validation record is refused when acceptance is not met', () => {
  const weak = runHarness([{ id: '1', truth: true, predicted: false }, { id: '2', truth: false, predicted: false }]);
  assert.equal(toValidationRecord(weak, meta, '±2%', { minSensitivity: 0.9, minSpecificity: 0.9 }), null);
});

test('a validation record is built when acceptance is met, with provenance', () => {
  const strong = runHarness([
    { id: '1', truth: true, predicted: true },
    { id: '2', truth: false, predicted: false },
  ]);
  const record = toValidationRecord(strong, meta, '±2%', { minSensitivity: 0.9, minSpecificity: 0.9 });
  assert.ok(record);
  assert.match(record!.reference, /spo2\.cases@1\.0\.0/);
});

test('model promotion requires both acceptance and an explicit pin', () => {
  const strong = runHarness([{ id: '1', truth: true, predicted: true }, { id: '2', truth: false, predicted: false }]);
  const acceptance = { minSensitivity: 0.9, minSpecificity: 0.9 };
  assert.equal(promotionDecision('spo2', strong, acceptance, false).promote, false);
  assert.match(promotionDecision('spo2', strong, acceptance, false).reason, /pinned/i);
  assert.equal(promotionDecision('spo2', strong, acceptance, true).promote, true);

  const weak = runHarness([{ id: '1', truth: true, predicted: false }]);
  assert.equal(promotionDecision('spo2', weak, acceptance, true).promote, false);
});
