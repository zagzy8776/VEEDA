import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHILD_NOT_VALIDATED_NOTE,
  DEFAULT_ADULT_AGE_CUTOFF,
  SELF_SUBJECT,
  activeSubject,
  activeSubjectKey,
  adultScoresAllowed,
  ageBand,
  setActiveSubject,
} from '../src/app/dependents.ts';

// The age gate is the clinical-safety heart of family profiles: an adult-only
// tool (NEWS2, qSOFA) must never run for a child or an unknown age. These tests
// pin that, and the configurable cutoff, and the per-guardian switcher state.

class TestStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const GUARDIAN = 'guardian-1';
const store = new TestStorage();

beforeEach(() => store.clear());

test('the default cutoff is a safe fallback and the note is the exact wording', () => {
  assert.equal(DEFAULT_ADULT_AGE_CUTOFF, 16);
  assert.equal(CHILD_NOT_VALIDATED_NOTE, 'Not validated for children');
});

test('ageBand classifies adult, child, and unknown against a cutoff', () => {
  assert.equal(ageBand(30, 16), 'adult');
  assert.equal(ageBand(16, 16), 'adult');
  assert.equal(ageBand(15, 16), 'child');
  assert.equal(ageBand(0, 16), 'child');
  assert.equal(ageBand(null, 16), 'unknown');
  assert.equal(ageBand(undefined, 16), 'unknown');
  assert.equal(ageBand(Number.NaN, 16), 'unknown');
});

test('adult-only scores are allowed only for a known adult', () => {
  assert.equal(adultScoresAllowed(30, 16), true);
  assert.equal(adultScoresAllowed(15, 16), false, 'a child must not be scored');
  assert.equal(adultScoresAllowed(null, 16), false, 'an unknown age must not be scored');
});

test('the cutoff is configuration, not hard-coded: a different value changes the band', () => {
  // With an 18 cutoff the same 16-year-old is now a child.
  assert.equal(adultScoresAllowed(16, 18), false);
  assert.equal(adultScoresAllowed(18, 18), true);
});

test('the active subject defaults to the account owner and is per-guardian', () => {
  assert.equal(activeSubject(store, GUARDIAN), SELF_SUBJECT);
  setActiveSubject(store, GUARDIAN, 'dep-1');
  assert.equal(activeSubject(store, GUARDIAN), 'dep-1');
  assert.equal(activeSubject(store, 'other-guardian'), SELF_SUBJECT, 'another guardian is unaffected');
});

test('setting the owner again clears the stored override for that guardian', () => {
  setActiveSubject(store, GUARDIAN, 'dep-1');
  setActiveSubject(store, GUARDIAN, SELF_SUBJECT);
  assert.equal(store.getItem(activeSubjectKey(GUARDIAN)), null);
  assert.equal(activeSubject(store, GUARDIAN), SELF_SUBJECT);
});
