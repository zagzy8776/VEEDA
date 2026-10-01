import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadProfilePack, getProfile } from '../src/app/conditionProfiles.ts';
import {
  profileLogStorageKey, loadProfileLog, appendProfileLog, profileLogFor, profileLogCsv,
} from '../src/app/profileLog.ts';
import { perUserDeviceKeys } from '../src/app/api.ts';

const example = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/app/conditionProfilePack.example.json', import.meta.url)), 'utf8'),
);

const reviewed = {
  id: 'condition.profiles', version: '1.0.0', reviewer: 'Dr. Test', reviewerCredential: 'Physician',
  reviewDate: '2026-01-01', region: 'NG', clinicallyReviewed: true,
  entries: [{
    condition: 'epilepsy',
    warningSigns: [{ id: 'w1', label: 'warning label', action: 'do this' }],
    logFields: [{ id: 'seizure.duration', label: 'duration', type: 'number', unit: 'seconds' }],
    testReminders: [{ id: 't1', label: 'test', schedule: 'per reviewer' }],
    medicineWarnings: [{ id: 'm1', warning: 'pack warning text' }],
    emergencyCard: { title: 'Card', lines: ['line one'] },
  }],
};

test('the example condition-profile pack is refused in production and works in development', () => {
  assert.equal(loadProfilePack(example, { production: true }).ok, false);
  assert.equal(loadProfilePack(example).ok, true);
});

test('a reviewed pack parses into typed profile fields with no content invented', () => {
  const result = loadProfilePack(reviewed);
  assert.equal(result.ok, true);
  const profile = getProfile(result, 'epilepsy');
  assert.ok(profile);
  assert.equal(profile?.logFields[0].id, 'seizure.duration');
  assert.equal(profile?.logFields[0].unit, 'seconds');
  assert.equal(profile?.emergencyCard.title, 'Card');
});

test('an unknown condition id is rejected', () => {
  const bad = { ...reviewed, entries: [{ ...reviewed.entries[0], condition: 'made_up' }] };
  assert.equal(loadProfilePack(bad).ok, false);
});

test('a log field with a bad type is rejected', () => {
  const bad = {
    ...reviewed,
    entries: [{ ...reviewed.entries[0], logFields: [{ id: 'x', label: 'y', type: 'colour' }] }],
  };
  assert.equal(loadProfilePack(bad).ok, false);
});

test('profile logs are per-user, filterable by condition, and exportable as CSV', () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
  appendProfileLog(storage, 'u1', { recordedAt: '2026-01-02T00:00:00.000Z', condition: 'epilepsy', values: { 'seizure.duration': 12 }, note: 'note, with comma' });
  appendProfileLog(storage, 'u1', { recordedAt: '2026-01-03T00:00:00.000Z', condition: 'hypertension', values: { 'weight.kg': 70 } });
  assert.equal(loadProfileLog(storage, 'u1').length, 2);
  assert.equal(loadProfileLog(storage, 'u2').length, 0);
  assert.equal(profileLogFor(storage, 'u1', 'epilepsy').length, 1);
  const csv = profileLogCsv(profileLogFor(storage, 'u1', 'epilepsy'));
  assert.match(csv, /recordedAt,condition,seizure.duration,note/);
  assert.match(csv, /"note, with comma"/);
});

test('the profile log key is in the logout clear set', () => {
  assert.ok(perUserDeviceKeys('u1').includes(profileLogStorageKey('u1')));
});
