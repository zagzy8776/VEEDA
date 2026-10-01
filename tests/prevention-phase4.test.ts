import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCrisisReferral, loadCheckInPack } from '../src/app/mentalHealth.ts';
import { computeDailyHealthScore } from '../src/app/healthScore.ts';
import { loadPreventionPack, evaluateTriage, dueReminders } from '../src/app/prevention.ts';

const reviewedMeta = {
  id: 'x', version: '1.0.0', reviewer: 'Dr. Test', reviewerCredential: 'Physician',
  reviewDate: '2026-01-01', region: 'NG', clinicallyReviewed: true,
};

test('mental-health crisis referral is OFF in production without a pack', () => {
  const state = resolveCrisisReferral(null, { production: true, requested: true }, '112');
  assert.equal(state.available, false);
  assert.match(state.reason, /not available/i);
  assert.match(state.reason, /112/);
});

test('crisis referral does not expose an unverified number when the flag is off', () => {
  const pack = { numbers: [{ label: 'X', number: '000' }], message: 'm' };
  const state = resolveCrisisReferral(pack, { production: true, requested: false }, '112');
  assert.equal(state.available, false);
  assert.equal(state.referral, undefined);
});

test('crisis referral is available only with the flag on AND a reviewed pack', () => {
  const pack = { numbers: [{ label: 'X', number: '111' }], message: 'm' };
  const state = resolveCrisisReferral(pack, { production: false, requested: true }, '112');
  assert.equal(state.available, true);
  assert.equal(state.referral?.numbers[0].number, '111');
});

test('check-in pack rejects an invalid question and accepts a valid one', () => {
  assert.equal(loadCheckInPack({ ...reviewedMeta, entries: [{ id: 'q', prompt: 'p', type: 'bogus' }] }).ok, false);
  const ok = loadCheckInPack({ ...reviewedMeta, entries: [{ id: 'q', prompt: 'p', type: 'yes_no' }] });
  assert.equal(ok.ok, true);
});

test('the daily score is non-clinical, transparent and null with no inputs', () => {
  const empty = computeDailyHealthScore([]);
  assert.equal(empty.score, null);
  assert.match(empty.label, /non-clinical/i);
  assert.match(empty.formula, /average/i);

  const scored = computeDailyHealthScore([
    { id: 'hr', label: 'Heart rate', value: 70, source: 'camera_estimate', range: { min: 60, max: 100 } },
    { id: 'steps', label: 'Steps', value: 8000, source: 'device' },
    { id: 'temp', label: 'Temperature', value: null, source: 'typed_in' },
  ]);
  assert.ok(scored.score !== null);
  assert.equal(scored.confidence, 2 / 3);
  assert.ok(scored.components.every(c => c.source));
  assert.match(scored.label, /not a diagnosis/i);
});

test('prevention engine fails safe with no pack and evaluates rules with one', () => {
  const noPack = loadPreventionPack(null, { production: true });
  assert.equal(noPack.ok, false);
  assert.equal(evaluateTriage(noPack, { fever: true }, '112').state, 'unavailable');

  const pack = {
    ...reviewedMeta,
    entries: {
      rules: [
        { id: 'r1', domain: 'malaria_first', when: { inputId: 'fever', op: 'truthy' }, outcome: 'see_clinician', message: 'pack message' },
      ],
      reminders: [{ id: 'rm1', domain: 'screening', label: 'screening reminder', everyDays: 30 }],
    },
  };
  const loaded = loadPreventionPack(pack);
  assert.equal(loaded.ok, true);
  const out = evaluateTriage(loaded, { fever: true });
  assert.equal(out.state, 'evaluated');
  assert.equal(out.outcome, 'see_clinician');
  assert.equal(out.message, 'pack message');
  assert.equal(out.redFlag, false);
});

test('reminders fall due on the pack cadence, not a hard-coded schedule', () => {
  const pack = {
    ...reviewedMeta,
    entries: { rules: [], reminders: [{ id: 'rm1', domain: 'screening', label: 'x', everyDays: 30 }] },
  };
  const loaded = loadPreventionPack(pack);
  const now = new Date('2026-02-01T00:00:00.000Z');
  const due = dueReminders(loaded, { rm1: '2026-01-25' }, now);
  assert.equal(due.length, 0); // only 7 days elapsed, cadence is 30
  const due2 = dueReminders(loaded, { rm1: '2025-12-01' }, now);
  assert.equal(due2.length, 1);
});
