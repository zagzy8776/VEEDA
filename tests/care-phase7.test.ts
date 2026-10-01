import test from 'node:test';
import assert from 'node:assert/strict';
import { findCare, bookingState } from '../src/app/care.ts';
import { intakeGate, adviceFor, explainResult } from '../src/app/careFlow.ts';

test('care search returns no prices or stock without a partner source', async () => {
  const places = [{ id: '1', name: 'Lab A', kind: 'lab' as const, source: 'unknown' as const, prices: [{ label: 'test', amount: '100' }] }];
  const result = await findCare('malaria', { endpoint: '' }, places);
  assert.equal(result[0].source, 'unknown');
  assert.equal(result[0].prices, undefined);
});

test('care search never fabricates prices when the partner fails', async () => {
  const places = [{ id: '1', name: 'Lab A', kind: 'lab' as const, source: 'unknown' as const }];
  const failing = { endpoint: 'https://x.test', fetchImpl: async () => { throw new Error('down'); } };
  const result = await findCare('x', failing, places);
  assert.equal(result[0].source, 'unknown');
});

test('booking is disabled in production without a configured partner', () => {
  assert.equal(bookingState({ production: true, requested: true }).available, false);
  assert.equal(bookingState({ production: true, requested: true, configured: 'partner-1' }).available, true);
});

test('intake must be complete before any advice', () => {
  const questions = [{ id: 'q1', required: true }, { id: 'q2', required: true }, { id: 'q3' }];
  assert.equal(intakeGate(questions, { q1: 'a' }).complete, false);
  assert.deepEqual(intakeGate(questions, { q1: 'a' }).missing, ['q2']);
  assert.equal(intakeGate(questions, { q1: 'a', q2: 'b' }).complete, true);

  const blocked = adviceFor({ intake: intakeGate(questions, { q1: 'a' }), referral: { redFlag: false, message: 'm', state: 'evaluated' } });
  assert.equal(blocked.state, 'blocked');
});

test('a red flag is referred, never turned into advice', () => {
  const out = adviceFor({
    intake: { complete: true, missing: [] },
    referral: { redFlag: true, message: 'pack red flag', state: 'evaluated' },
  });
  assert.equal(out.state, 'refer');
  assert.match((out as { reason: string }).reason, /red flag/i);
});

test('a missing pack refers to help instead of advising', () => {
  const out = adviceFor({ intake: { complete: true, missing: [] }, referral: { redFlag: false, state: 'unavailable' } });
  assert.equal(out.state, 'refer');
});

test('advice carries its pack provenance', () => {
  const out = adviceFor({
    intake: { complete: true, missing: [] },
    referral: { redFlag: false, message: 'pack message', advice: 'pack advice', reviewedBy: 'Dr. X (2026-01-01)', state: 'evaluated' },
  });
  assert.equal(out.state, 'advise');
  assert.match((out as { reviewedBy: string }).reviewedBy, /Dr\. X/);
});

test('every result is explainable with inputs, sources and a disclaimer', () => {
  const explanation = explainResult(
    [{ id: 'hr', label: 'Heart rate', value: 70, source: 'camera_estimate' }],
    { reviewedBy: 'Dr. X', modelVersion: '1.2.0' },
  );
  assert.equal(explanation.inputs[0].source, 'camera_estimate');
  assert.equal(explanation.modelVersion, '1.2.0');
  assert.match(explanation.disclaimer, /not a diagnosis/i);
});
