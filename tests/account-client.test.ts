import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearSession,
  deleteAccount,
  exportAccountData,
  setSession,
} from '../src/app/api.ts';

// The client never decides these on its own: export must carry the session, and
// delete must send BOTH the password and the typed word so the server re-checks
// them. These tests pin the request shape and the error surface.

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

beforeEach(() => {
  storage.clear();
  clearSession();
  globalThis.localStorage = storage as unknown as Storage;
  setSession({ accessToken: 'access-token-1', expiresIn: 900, user: { id: 'user-1', email: 'u@e.com', role: 'patient' } });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('exportAccountData fetches the account export with the bearer token', async () => {
  let captured: { url: string; init?: RequestInit } | null = null;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return jsonResponse({ generatedAt: 'x', data: { biometric_events: [] } });
  };

  const data = await exportAccountData();
  assert.ok(data);
  assert.equal(captured?.url, '/api/account/export');
  const headers = new Headers(captured?.init?.headers || {});
  assert.equal(headers.get('authorization'), 'Bearer access-token-1');
});

test('deleteAccount sends the password and the typed DELETE word', async () => {
  let captured: { url: string; init?: RequestInit } | null = null;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return jsonResponse({ ok: true });
  };

  const result = await deleteAccount('hunter2hunter2', 'DELETE');
  assert.deepEqual(result, { ok: true });
  assert.equal(captured?.url, '/api/account');
  assert.equal(captured?.init?.method, 'DELETE');
  assert.deepEqual(JSON.parse(String(captured?.init?.body)), {
    password: 'hunter2hunter2',
    confirm: 'DELETE',
  });
});

test('deleteAccount surfaces the server error without throwing', async () => {
  globalThis.fetch = async () => jsonResponse({ error: 'Password is incorrect' }, 401);
  const result = await deleteAccount('wrong-password', 'DELETE');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Password is incorrect');
});

test('deleteAccount reports an unreachable server instead of pretending success', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  const result = await deleteAccount('hunter2hunter2', 'DELETE');
  assert.equal(result.ok, false);
  assert.match(String(result.error), /reach the server/i);
});
