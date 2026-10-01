import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch, clearSession, setSession } from '../src/app/api.ts';
import {
  buildTimeEmergencyNumber,
  cachedEmergencyNumber,
  clearCachedEmergencyNumber,
  EMERGENCY_CACHE_KEY,
  emergencyHelpLine,
  emergencyTelHref,
  getBackendEmergencyNumber,
  recordEmergencyNumber,
  resolveEmergencyNumber,
} from '../src/app/emergencyNumber.ts';

// The emergency number must survive a slow/offline backend and must never invent
// digits. The resolver order is: backend value > device cache > build-time
// fallback > plain "call your local emergency number" (no number, no auto-dial).

class TestStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const storage = new TestStorage();
const originalFetch = globalThis.fetch;
const originalEnv = (globalThis as { __veedaEnv?: Record<string, string | undefined> }).__veedaEnv;

function setBuildTimeNumber(value: string | undefined) {
  const env: Record<string, string | undefined> = { ...(originalEnv || {}) };
  if (value === undefined) delete env.VITE_EMERGENCY_NUMBER;
  else env.VITE_EMERGENCY_NUMBER = value;
  (globalThis as { __veedaEnv?: Record<string, string | undefined> }).__veedaEnv = env;
}

beforeEach(() => {
  storage.clear();
  clearSession();
  clearCachedEmergencyNumber();
  recordEmergencyNumber(null);
  globalThis.localStorage = storage as unknown as Storage;
  setBuildTimeNumber(undefined);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  setBuildTimeNumber(undefined);
});

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('backend slow/offline: a cached number still answers and dials', async () => {
  setSession({ accessToken: 'tok', expiresIn: 900, user: { id: 'user-1', email: 'u@e.com', role: 'patient' } });

  // First call succeeds and populates the device cache.
  globalThis.fetch = async () => jsonResponse({ emergencyNumber: '767' });
  await apiFetch('/api/analyze', { method: 'POST', body: '{}' });
  assert.equal(cachedEmergencyNumber(), '767');
  assert.equal(getBackendEmergencyNumber(), '767');

  // Now the backend is offline: the resolver must still return the cached value.
  globalThis.fetch = async () => { throw new Error('offline'); };
  setSession({ accessToken: 'tok', expiresIn: 900, user: { id: 'user-1', email: 'u@e.com', role: 'patient' } });
  const offlineResult = await apiFetch('/api/analyze', { method: 'POST', body: '{}' });
  assert.equal(offlineResult, null);
  assert.equal(resolveEmergencyNumber(), '767');
  assert.equal(emergencyTelHref(), 'tel:767');

  // A fresh page load (in-memory value cleared) still resolves from the cache.
  recordEmergencyNumber(null);
  assert.equal(getBackendEmergencyNumber(), null);
  assert.equal(resolveEmergencyNumber(), '767');
  assert.equal(emergencyTelHref(), 'tel:767');
});

test('no cache: a build-time VITE_EMERGENCY_NUMBER is used as fallback', () => {
  recordEmergencyNumber(null);
  clearCachedEmergencyNumber();
  setBuildTimeNumber('112');

  assert.equal(buildTimeEmergencyNumber(), '112');
  assert.equal(resolveEmergencyNumber(), '112');
  assert.equal(emergencyTelHref(), 'tel:112');
});

test('backend value overrides both the cache and the build-time fallback', () => {
  setBuildTimeNumber('112');
  recordEmergencyNumber('767'); // cached/previous value
  clearCachedEmergencyNumber();
  assert.equal(cachedEmergencyNumber(), null);

  recordEmergencyNumber('999'); // backend just returned 999
  assert.equal(resolveEmergencyNumber(), '999');
  assert.equal(emergencyTelHref(), 'tel:999');
});

test('none configured: no number, no dial target, plain wording only', () => {
  recordEmergencyNumber(null);
  clearCachedEmergencyNumber();
  setBuildTimeNumber(undefined);

  assert.equal(resolveEmergencyNumber(), null);
  assert.equal(emergencyTelHref(), null);
  const line = emergencyHelpLine();
  assert.match(line, /local emergency number/i);
  assert.equal(/\d/.test(line), false, 'the fallback wording must contain no digits');
});

test('apiFetch records the backend number and caches it for later', async () => {
  clearCachedEmergencyNumber();
  setSession({ accessToken: 'tok', expiresIn: 900, user: { id: 'user-1', email: 'u@e.com', role: 'patient' } });
  globalThis.fetch = async () => jsonResponse({ emergencyNumber: '112', emergencyNumberGeneric: '112' });

  await apiFetch('/api/triage/referral', { method: 'POST', body: '{}' });

  assert.equal(getBackendEmergencyNumber(), '112');
  assert.equal(storage.getItem(EMERGENCY_CACHE_KEY), '112');
  assert.equal(resolveEmergencyNumber(), '112');
});

test('a response with a null emergencyNumber does not clobber the device cache', async () => {
  clearCachedEmergencyNumber();
  setSession({ accessToken: 'tok', expiresIn: 900, user: { id: 'user-1', email: 'u@e.com', role: 'patient' } });

  globalThis.fetch = async () => jsonResponse({ emergencyNumber: '767' });
  await apiFetch('/api/analyze', { method: 'POST', body: '{}' });
  assert.equal(cachedEmergencyNumber(), '767');

  globalThis.fetch = async () => jsonResponse({ emergencyNumber: null });
  await apiFetch('/api/analyze', { method: 'POST', body: '{}' });

  assert.equal(getBackendEmergencyNumber(), null);
  assert.equal(cachedEmergencyNumber(), '767', 'cache must not be cleared by a null response');
  assert.equal(resolveEmergencyNumber(), '767');
});
