import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSENT_VERSION,
  SERVER_FEATURE,
  getConsent,
  hasConsent,
  recordConsent,
  syncConsent,
  withdrawAllConsent,
  withdrawAllConsentAndSync,
  withdrawConsent,
  withdrawConsentAndSync,
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

// --- server-of-record sync (localStorage is only a cache) ---

test('syncConsent posts the mapped feature, version and granted flag with an auth header', async () => {
  let seen: any = null;
  const fakeFetch = (async (url: string, init: any) => {
    seen = { url, init };
    return { ok: true, status: 200 } as Response;
  }) as unknown as typeof fetch;

  const result = await syncConsent(fakeFetch, 'https://api.test', 'tok-123', 'medication_reminders', true);

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(seen.url, 'https://api.test/api/consent');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers.authorization, 'Bearer tok-123');
  const body = JSON.parse(seen.init.body);
  assert.deepEqual(body, { feature: 'reminders', version: CONSENT_VERSION, granted: true });
});

test('syncConsent records withdrawal as granted:false', async () => {
  let seen: any = null;
  const fakeFetch = (async (_url: string, init: any) => {
    seen = init;
    return { ok: true, status: 200 } as Response;
  }) as unknown as typeof fetch;

  await syncConsent(fakeFetch, 'https://api.test', 'tok', 'shareable_summary', false);
  assert.equal(JSON.parse(seen.body).granted, false);
  assert.equal(JSON.parse(seen.body).feature, 'sharing');
});

test('syncConsent never throws when the network fails', async () => {
  const fakeFetch = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
  const result = await syncConsent(fakeFetch, 'https://api.test', 'tok', 'health_data_processing', true);
  assert.equal(result.ok, false);
});

test('syncConsent reports a non-2xx response as not ok', async () => {
  const fakeFetch = (async () => ({ ok: false, status: 503 } as Response)) as unknown as typeof fetch;
  const result = await syncConsent(fakeFetch, 'https://api.test', 'tok', 'health_data_processing', true);
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
});

test('every client feature maps to a known server feature', () => {
  const clientFeatures = Object.keys(SERVER_FEATURE);
  assert.deepEqual(clientFeatures.sort(), [
    'bp_glucose_logging',
    'health_data_processing',
    'medication_reminders',
    'shareable_summary',
  ]);
  for (const value of Object.values(SERVER_FEATURE)) {
    assert.ok(['health_data', 'sharing', 'reminders'].includes(value));
  }
});

test('withdrawConsentAndSync removes the local record AND posts granted:false', async () => {
  const storage = new TestStorage();
  recordConsent(storage, USER, 'medication_reminders');
  assert.equal(hasConsent(storage, USER, 'medication_reminders'), true);

  let seen: any = null;
  const fakeFetch = (async (_url: string, init: any) => {
    seen = init;
    return { ok: true, status: 200 } as Response;
  }) as unknown as typeof fetch;

  const result = await withdrawConsentAndSync(storage, USER, 'medication_reminders', fakeFetch, 'https://api.test', 'tok');

  assert.equal(result.ok, true);
  assert.equal(hasConsent(storage, USER, 'medication_reminders'), false);
  assert.equal(getConsent(storage, USER, 'medication_reminders'), null);
  const body = JSON.parse(seen.body);
  assert.equal(body.granted, false, 'the server row must be withdrawn, not just the cache');
  assert.equal(body.feature, 'reminders');
});

test('withdrawAllConsentAndSync withdrawals every feature on the server', async () => {
  const storage = new TestStorage();
  recordConsent(storage, USER, 'health_data_processing');
  recordConsent(storage, USER, 'shareable_summary');

  const bodies: any[] = [];
  const fakeFetch = (async (_url: string, init: any) => {
    bodies.push(JSON.parse(init.body));
    return { ok: true, status: 200 } as Response;
  }) as unknown as typeof fetch;

  const results = await withdrawAllConsentAndSync(
    storage, USER, ['health_data_processing', 'shareable_summary'], fakeFetch, 'https://api.test', 'tok',
  );

  assert.equal(results.every(r => r.ok), true);
  assert.equal(bodies.length, 2);
  assert.ok(bodies.every(b => b.granted === false));
  assert.deepEqual(bodies.map(b => b.feature).sort(), ['health_data', 'sharing']);
  assert.equal(hasConsent(storage, USER, 'health_data_processing'), false);
  assert.equal(hasConsent(storage, USER, 'shareable_summary'), false);
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
