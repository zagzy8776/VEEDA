import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startLadder, acknowledge, advance, isSos, caregiverAlertDue,
} from '../src/app/escalation.ts';

test('the ladder starts at the check-in rung and is not yet escalated', () => {
  const state = startLadder();
  assert.equal(state.rung, 'check_in');
  assert.equal(state.acknowledged, false);
  assert.equal(caregiverAlertDue(state), false);
});

test('an unanswered check-in escalates to the family call and raises the caregiver alert', () => {
  let state = startLadder();
  state = advance(state);
  assert.equal(state.rung, 'family_call');
  assert.equal(caregiverAlertDue(state), true);
  state = advance(state);
  assert.equal(state.rung, 'sos');
  assert.equal(isSos(state), true);
});

test('SOS is terminal: the ladder never downgrades or leaves it', () => {
  let state = advance(advance(startLadder()));
  const again = advance(state);
  assert.equal(again.rung, 'sos');
});

test('answering the check-in resolves the ladder and stops escalation', () => {
  const resolved = acknowledge(startLadder());
  const next = advance(resolved);
  assert.equal(next.rung, 'check_in');
  assert.equal(next.acknowledged, true);
  assert.equal(caregiverAlertDue(next), false);
});

test('timeouts are overridable configuration, not a fixed clinical rule', () => {
  const state = startLadder({ check_in: 1234 });
  assert.equal(state.timeoutMs, 1234);
});
