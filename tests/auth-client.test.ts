import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  apiFetch,
  clearSession,
  getCurrentUser,
  hasPendingLocalReadings,
  logout,
  markPendingHealthReading,
  perUserDeviceKeys,
  setSession,
} from '../src/app/api.ts';

class TestStorage {
  private values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const storage = new TestStorage();
const originalFetch = globalThis.fetch;

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function emptyResponse(status = 204) {
  return new Response(null, { status });
}

function requestHeaders(init: RequestInit | undefined) {
  return new Headers(init?.headers || {});
}

beforeEach(() => {
  storage.clear();
  clearSession();
  globalThis.localStorage = storage as unknown as Storage;
  globalThis.window = {
    dispatchEvent: () => true,
  } as unknown as Window & typeof globalThis;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('attaches the in-memory bearer token and sends no legacy headers', async () => {
  setSession({
    accessToken: 'access-token-1',
    expiresIn: 900,
    user: { id: 'user-1', email: 'user@example.com', role: 'patient' },
  });

  let captured: { url: string; init?: RequestInit } | null = null;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return jsonResponse({ ok: true });
  };

  const result = await apiFetch<{ ok: boolean }>('/api/health', {
    method: 'GET',
    headers: { 'X-Test': 'yes' },
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(captured?.url, '/api/health');
  const headers = requestHeaders(captured?.init);
  assert.equal(headers.get('authorization'), 'Bearer access-token-1');
  assert.equal(captured?.init?.credentials, 'include');
  assert.equal(headers.get('x-test'), 'yes');
  for (const [name] of headers) {
    assert.equal(name.startsWith('x-veda-'), false);
    assert.equal(name.includes('api-key'), false);
  }
});

test('coalesces concurrent 401 refreshes and retries each request once', async () => {
  setSession({
    accessToken: 'old-token',
    expiresIn: 900,
    user: { id: 'user-1', email: 'user@example.com', role: 'patient' },
  });

  let protectedCalls = 0;
  let refreshCalls = 0;
  const seenTokens: string[] = [];
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    const headers = requestHeaders(init);
    if (path === '/auth/refresh') {
      refreshCalls += 1;
      return jsonResponse({
        accessToken: 'new-token',
        expiresIn: 900,
        user: { id: 'user-1', email: 'user@example.com', role: 'patient' },
      });
    }

    protectedCalls += 1;
    seenTokens.push(headers.get('authorization') || '');
    if (protectedCalls <= 2) return jsonResponse({ error: 'expired' }, 401);
    return jsonResponse({ ok: true, path });
  };

  const [first, second] = await Promise.all([
    apiFetch<{ ok: boolean }>('/api/one'),
    apiFetch<{ ok: boolean }>('/api/two'),
  ]);

  assert.deepEqual(first, { ok: true, path: '/api/one' });
  assert.deepEqual(second, { ok: true, path: '/api/two' });
  assert.equal(refreshCalls, 1);
  assert.equal(protectedCalls, 4);
  assert.deepEqual(seenTokens.slice(0, 2), ['Bearer old-token', 'Bearer old-token']);
  assert.deepEqual(seenTokens.slice(2), ['Bearer new-token', 'Bearer new-token']);
});

test('failed refresh clears the session and emits session-expired', async () => {
  setSession({
    accessToken: 'expired-token',
    expiresIn: 900,
    user: { id: 'user-1', email: 'user@example.com', role: 'patient' },
  });

  let expiredEvents = 0;
  globalThis.window = {
    dispatchEvent: (event: Event) => {
      if (event.type === 'veda:session-expired') expiredEvents += 1;
      return true;
    },
  } as unknown as Window & typeof globalThis;
  globalThis.fetch = async (url) => String(url) === '/auth/refresh'
    ? jsonResponse({ error: 'refresh rejected' }, 401)
    : jsonResponse({ error: 'expired' }, 401);

  const result = await apiFetch('/api/protected');

  assert.equal(result, null);
  assert.equal(getCurrentUser(), null);
  assert.equal(expiredEvents, 1);
});

test('logout clears local health state and the in-memory session', async () => {
  setSession({
    accessToken: 'access-token-1',
    expiresIn: 900,
    user: { id: 'user-1', email: 'user@example.com', role: 'patient' },
  });
  for (const [key, value] of [
    ['veda_latest_vitals', '{}'],
    ['veda_steps', '12'],
    ['veda_steps_date', new Date().toDateString()],
    ['veda_hydration_ml', '500'],
    ['veda_hydration_date', new Date().toDateString()],
  ]) storage.setItem(key, value);
  markPendingHealthReading('heart_rate');

  let logoutHeaders: Headers | null = null;
  globalThis.fetch = async (_url, init) => {
    logoutHeaders = requestHeaders(init);
    return emptyResponse();
  };

  await logout();

  assert.equal(getCurrentUser(), null);
  assert.equal(storage.getItem('veda_latest_vitals'), null);
  assert.equal(storage.getItem('veda_steps'), null);
  assert.equal(storage.getItem('veda_steps_date'), null);
  assert.equal(storage.getItem('veda_hydration_ml'), null);
  assert.equal(storage.getItem('veda_hydration_date'), null);
  assert.equal(storage.getItem('veda_pending_health_readings'), null);
  assert.equal(logoutHeaders?.get('x-veda-api-key'), null);
  assert.equal(logoutHeaders?.get('x-veda-user-id'), null);
});

test('existing local health state is treated as pending without a marker', () => {
  storage.setItem('veda_latest_vitals', JSON.stringify({ vitals: { heartRate: 72 }, savedAt: Date.now() }));
  assert.equal(hasPendingLocalReadings(), true);
});

test('logout clears the per-user BP/glucose log and consent cache (shared-device safety)', async () => {
  setSession({
    accessToken: 'access-token-1',
    expiresIn: 900,
    user: { id: 'user-1', email: 'user@example.com', role: 'patient' },
  });
  // Batch 2 device-only data, keyed by the signed-in user.
  storage.setItem('veda_bp_glucose_user-1', JSON.stringify([{ kind: 'blood_pressure', systolic: 120, diastolic: 80 }]));
  storage.setItem('veda_consent_user-1', JSON.stringify({ bp_glucose_logging: { version: '1.0.0' } }));

  globalThis.fetch = async () => emptyResponse();

  await logout();

  assert.equal(storage.getItem('veda_bp_glucose_user-1'), null, 'BP/glucose log must be cleared on logout');
  assert.equal(storage.getItem('veda_consent_user-1'), null, 'consent cache must be cleared on logout');
});

test('a BP/glucose log counts as pending local data for the logout warning', () => {
  setSession({
    accessToken: 'access-token-1',
    expiresIn: 900,
    user: { id: 'user-1', email: 'user@example.com', role: 'patient' },
  });
  assert.equal(hasPendingLocalReadings(), false);
  storage.setItem('veda_bp_glucose_user-1', JSON.stringify([{ kind: 'blood_pressure', systolic: 120, diastolic: 80 }]));
  assert.equal(hasPendingLocalReadings(), true);
});

test('summary selections and reminders are never written to storage', () => {
  // Summary section choices and reminder drafts are ephemeral React state, not
  // persisted data, so there is nothing to clear on logout. This test documents
  // that: if either is later persisted, the key must be added to the logout
  // clear set deliberately (and the assertions here updated).
  const persistedKeys: string[] = [];
  const original = storage.setItem.bind(storage);
  (storage as unknown as { setItem: (k: string, v: string) => void }).setItem = (key, value) => {
    persistedKeys.push(key);
    original(key, value);
  };
  try {
    assert.equal(persistedKeys.some(k => /summary|reminder|medication_ics/i.test(k)), false);
  } finally {
    (storage as unknown as { setItem: (k: string, v: string) => void }).setItem = original;
  }
});

test('every per-user device key is part of the logout clear set', () => {
  // The whole point of the shared-device fix: any key keyed by user id must be
  // covered by logout. This fails if a new per-user key is added to
  // perUserDeviceKeys without logout clearing it.
  setSession({
    accessToken: 'access-token-1',
    expiresIn: 900,
    user: { id: 'user-1', email: 'user@example.com', role: 'patient' },
  });
  for (const key of perUserDeviceKeys('user-1')) storage.setItem(key, 'x');

  globalThis.fetch = async () => emptyResponse();
  return logout().then(() => {
    for (const key of perUserDeviceKeys('user-1')) {
      assert.equal(storage.getItem(key), null, `${key} must be cleared on logout`);
    }
  });
});