import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearSyncState,
  enqueueUnsynced,
  flushPending,
  loadPending,
  pendingSyncKey,
  readingKey,
  syncReadings,
  syncedIdsKey,
} from '../src/app/readingsSync.ts';
import { addReading } from '../src/app/bpGlucose.ts';
import type { Reading } from '../src/app/bpGlucose.ts';

// The retry queue is what keeps a reading from being lost when the network
// drops. These tests pin the idempotent enqueue, the accept/reject bookkeeping,
// and that nothing is uploaded when consent is off.

class TestStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const USER = 'user-1';
const AT = '2026-01-01T10:00:00.000Z';
const bp: Reading = { kind: 'blood_pressure', systolic: 120, diastolic: 80, source: 'typed_in', recordedAt: AT };
const glucose: Reading = { kind: 'blood_glucose', value: 5.5, unit: 'mmol/L', source: 'typed_in', recordedAt: AT };

const store = new TestStorage();

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => store.clear());

test('enqueue is idempotent: the same on-device readings are queued once', () => {
  addReading(store, USER, bp);
  addReading(store, USER, glucose);

  enqueueUnsynced(store, USER);
  enqueueUnsynced(store, USER); // second call must not duplicate
  assert.equal(loadPending(store, USER).length, 2);
});

test('readingKey stays stable for the same reading across reloads', () => {
  assert.equal(readingKey(bp), readingKey({ ...bp }));
  assert.notEqual(readingKey(bp), readingKey({ ...bp, systolic: 121 }));
});

test('flushPending marks accepted ids synced and keeps the rest', async () => {
  addReading(store, USER, bp);
  addReading(store, USER, glucose);
  enqueueUnsynced(store, USER);

  globalThis.fetch = async () => jsonResponse({ accepted: [readingKey(bp)], rejected: [{ clientId: readingKey(glucose), error: 'check this value' }] });
  const outcome = await flushPending(store, USER, fetch, '', 'token');

  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.accepted, [readingKey(bp)]);
  assert.equal(loadPending(store, USER).length, 0, 'accepted and hard-rejected ids are both cleared');
  assert.match(store.getItem(syncedIdsKey(USER)) || '', /bp:120\/80/);
});

test('a failed upload keeps everything queued for a later retry', async () => {
  addReading(store, USER, bp);
  enqueueUnsynced(store, USER);

  globalThis.fetch = async () => { throw new Error('offline'); };
  const outcome = await flushPending(store, USER, fetch, '', 'token');

  assert.equal(outcome.ok, false);
  assert.equal(loadPending(store, USER).length, 1, 'the reading is retained for retry');
});

test('syncReadings uploads only when enabled', async () => {
  addReading(store, USER, bp);
  let called = false;
  globalThis.fetch = async () => { called = true; return jsonResponse({ accepted: [readingKey(bp)] }); };

  assert.equal(await syncReadings(store, USER, fetch, '', 'token', false), false);
  assert.equal(called, false, 'no upload without consent');

  assert.equal(await syncReadings(store, USER, fetch, '', 'token', true), true);
  assert.equal(called, true);
});

test('clearSyncState removes this user’s queue and synced bookkeeping', () => {
  addReading(store, USER, bp);
  enqueueUnsynced(store, USER);
  assert.ok(store.getItem(pendingSyncKey(USER)));
  clearSyncState(store, USER);
  assert.equal(store.getItem(pendingSyncKey(USER)), null);
  assert.equal(store.getItem(syncedIdsKey(USER)), null);
});
