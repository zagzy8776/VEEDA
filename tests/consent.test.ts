import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSENT_VERSION,
  getConsent,
  hasConsent,
  recordConsent,
  withdrawAllConsent,
  withdrawConsent,
  type StorageLike,
} from '../src/app/consent.ts';

class TestStorage implements StorageLike {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  raw(key: string) { return this.values.get(key) ?? null; }
}

const USER = 'user-1';
const OTHER = 'user-2';

test('records consent with a version and timestamp', () => {
  const storage = new TestStorage();
  const now = new Date('2026-01-02T03:04:05.000Z');
  const record = recordConsent(storage, USER, 'health_data_processing', now);

  assert.equal(record.feature, 'health_data_processing');
  assert.equal(record.version, CONSENT_VERSION);
  assert.equal(record.grantedAt, '2026-01-02T03:04:05.000Z');
  assert.deepEqual(getConsent(storage, USER, 'health_data_processing'), record);
});

test('hasConsent is false before granting and true after', () => {
  const storage = new TestStorage();
  assert.equal(hasConsent(storage, USER, 'shareable_summary'), false);
  recordConsent(storage, USER, 'shareable_summary');
  assert.equal(hasConsent(storage, USER, 'shareable_summary'), true);
});

test('withdrawing consent removes the record', () => {
  const storage = new TestStorage();
  recordConsent(storage, USER, 'shareable_summary');
  withdrawConsent(storage, USER, 'shareable_summary');
  assert.equal(getConsent(storage, USER, 'shareable_summary'), null);
  assert.equal(hasConsent(storage, USER, 'shareable_summary'), false);
});

test('consent is scoped per user and never leaks across accounts', () => {
  const storage = new TestStorage();
  recordConsent(storage, USER, 'bp_glucose_logging');
  assert.equal(hasConsent(storage, USER, 'bp_glucose_logging'), true);
  assert.equal(hasConsent(storage, OTHER, 'bp_glucose_logging'), false);
});

test('withdrawAllConsent clears every feature but only for that user', () => {
  const storage = new TestStorage();
  recordConsent(storage, USER, 'health_data_processing');
  recordConsent(storage, USER, 'medication_reminders');
  recordConsent(storage, OTHER, 'health_data_processing');

  withdrawAllConsent(storage, USER);

  assert.equal(hasConsent(storage, USER, 'health_data_processing'), false);
  assert.equal(hasConsent(storage, USER, 'medication_reminders'), false);
  assert.equal(hasConsent(storage, OTHER, 'health_data_processing'), true);
});

test('consent granted at an older version is treated as not granted', () => {
  const storage = new TestStorage();
  storage.setItem(
    `veda_consent_${USER}`,
    JSON.stringify({
      shareable_summary: { feature: 'shareable_summary', version: '0.9.0', grantedAt: '2020-01-01T00:00:00.000Z' },
    }),
  );
  assert.equal(hasConsent(storage, USER, 'shareable_summary'), false);
});

test('withdrawing the last consent removes the storage key entirely', () => {
  const storage = new TestStorage();
  recordConsent(storage, USER, 'medication_reminders');
  assert.notEqual(storage.raw(`veda_consent_${USER}`), null);
  withdrawConsent(storage, USER, 'medication_reminders');
  assert.equal(storage.raw(`veda_consent_${USER}`), null);
});

test('corrupt stored consent is ignored instead of throwing', () => {
  const storage = new TestStorage();
  storage.setItem(`veda_consent_${USER}`, '{not json');
  assert.equal(getConsent(storage, USER, 'health_data_processing'), null);
  assert.equal(hasConsent(storage, USER, 'health_data_processing'), false);
});
