import test from 'node:test';
import assert from 'node:assert/strict';
import {
  offlineQueueKey, loadQueue, enqueue, dequeue, isOffline,
  lowDataPolicy, trimPayload, ussdSession,
} from '../src/app/access.ts';
import { perUserDeviceKeys } from '../src/app/api.ts';

class TestStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
}

test('offline entries queue per user and flush by id', () => {
  const storage = new TestStorage();
  enqueue(storage, 'u1', { id: 'a', kind: 'reading', payload: { v: 1 }, queuedAt: '2026-01-01' });
  enqueue(storage, 'u1', { id: 'b', kind: 'reading', payload: { v: 2 }, queuedAt: '2026-01-01' });
  assert.equal(loadQueue(storage, 'u1').length, 2);
  assert.equal(loadQueue(storage, 'u2').length, 0);
  const remaining = dequeue(storage, 'u1', ['a']);
  assert.deepEqual(remaining.map(e => e.id), ['b']);
  const empty = dequeue(storage, 'u1', ['b']);
  assert.equal(empty.length, 0);
  assert.equal(storage.getItem(offlineQueueKey('u1')), null);
});

test('the offline queue key is in the logout clear set', () => {
  assert.ok(perUserDeviceKeys('u1').includes(offlineQueueKey('u1')));
});

test('offline detection reads the navigator flag', () => {
  assert.equal(isOffline({ onLine: false }), true);
  assert.equal(isOffline({ onLine: true }), false);
  assert.equal(isOffline(undefined), false);
});

test('low-data mode trims payloads and avoids maps unless asked', () => {
  const normal = lowDataPolicy(false, false);
  assert.equal(normal.allowImages, true);
  assert.equal(normal.allowMaps, true);

  const low = lowDataPolicy(true, false);
  assert.equal(low.allowImages, false);
  assert.equal(low.allowMaps, false);
  assert.equal(low.batchSize, 10);

  const lowAsked = lowDataPolicy(true, true);
  assert.equal(lowAsked.allowMaps, true);

  const trimmed = trimPayload({ value: 1, unit: 'mmHg', image: 'dataurl', trace: [1, 2, 3] }, low);
  assert.deepEqual(trimmed, { value: 1, unit: 'mmHg' });
  assert.deepEqual(trimPayload({ value: 1, image: 'x' }, normal), { value: 1, image: 'x' });
});

test('the USSD/SMS fallback is unavailable without a configured provider and shows no code', () => {
  assert.equal(ussdSession(null).available, false);
  assert.equal(ussdSession({ id: 'p' }).available, false);
  assert.equal(ussdSession({ id: 'p' }).shortCode, undefined);
  const on = ussdSession({ id: 'p', shortCode: '*123#' });
  assert.equal(on.available, true);
  assert.equal(on.shortCode, '*123#');
});
