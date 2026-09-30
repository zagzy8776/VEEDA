import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  apiFetch,
  clearSession,
  getCurrentUser,
  hasPendingLocalReadings,
  logout,
  markPendingHealthReading,
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