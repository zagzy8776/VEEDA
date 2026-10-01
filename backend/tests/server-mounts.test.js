import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

// Boot the REAL app that server.js exports and send one authenticated request to
// every mounted route group. Per-router unit tests each build their own little
// app, so they cannot see a router that is mounted wrongly on the real server —
// which is exactly the bug this suite exists to catch: four routes default-
// exported their router FACTORY, server.js mounted that default, and Express
// invoked the factory as middleware that never called next(), so every request
// reaching those mounts hung forever with a passing unit suite.
//
// No DATABASE_URL is set, so a route that queries the database fails closed (the
// lazy pool rejects) and still answers with a real status. A hang therefore means
// the wiring is broken, not that the database is missing.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-at-least-32-chars';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';
delete process.env.DATABASE_URL;

const { app } = await import('../server.js');

const SECRET = process.env.JWT_SECRET;
// Every request must answer well inside this; a mount bug answers never.
const RESPONSE_BUDGET_MS = 2000;

function token({ id = 'patient-1', role = 'patient', expiresIn = '15m' } = {}) {
  return jwt.sign(
    { sub: id, role },
    SECRET,
    { issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE, expiresIn },
  );
}

async function startServer() {
  const httpServer = http.createServer(app);
  // fetch keeps connections alive; unref the server so a lingering keep-alive
  // socket cannot keep the test process from exiting once the tests are done.
  httpServer.unref();
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address();
  return { httpServer, baseUrl: `http://127.0.0.1:${port}` };
}

async function closeServer(httpServer) {
  await new Promise((resolve, reject) => httpServer.close((error) => (error ? reject(error) : resolve())));
}

const { httpServer, baseUrl } = await startServer();
after(() => closeServer(httpServer));

/**
 * Send one request and FAIL (not hang) if it takes longer than the budget. A
 * hung mount never calls next() and never writes a response, so the fetch would
 * otherwise wait forever — the AbortController turns that into a thrown error the
 * assertion reports, and the timer is always cleared. The body is read as text
 * and parsed only when it is JSON, because a hung/failed route may answer with
 * plain text, HTML, or nothing at all, and that must not crash the probe.
 */
async function requestWithin(path, { method = 'GET', body, auth = token() } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESPONSE_BUDGET_MS);
  const startedAt = Date.now();
  try {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (auth) headers.authorization = `Bearer ${auth}`;
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }
    return { status: response.status, elapsedMs: Date.now() - startedAt, body: parsed };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(
        `${method} ${path} did not respond within ${RESPONSE_BUDGET_MS}ms — the route is mounted but never answers`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// One representative authenticated request per mounted route group. The status
// ranges are deliberately broad — 200/202 (handled), 400/401/403 (validation or
// authorization), 404 (nothing registered below the mount or resource missing),
// 500/503 (dependency missing) — what matters is that a real status arrives
// promptly and is not a hang. The only status that would signal the mount bug is
// none at all.
const ROUTE_GROUPS = [
  ['auth', 'POST', '/auth/login', { body: { email: 'nobody@example.com', password: 'wrong-password' }, auth: null }],
  ['analyze', 'POST', '/api/analyze', { body: { vitals: {} } }],
  ['triage', 'POST', '/api/triage/referral', { body: { vitals: {} } }],
  ['account', 'GET', '/api/account/export', {}],
  ['dependents', 'GET', '/api/dependents', {}],
  ['readings', 'GET', '/api/readings', {}],
  ['consent', 'GET', '/api/consent', {}],
  ['review-queue', 'GET', '/api/review-queue', {}],
  ['map', 'GET', '/api/map/tiles-token', {}],
  ['integrations', 'GET', '/api/integrations/fitbit/status', {}],
  ['fhir', 'GET', '/api/fhir/Patient/patient-1/vitals', {}],
];

for (const [group, method, path, options] of ROUTE_GROUPS) {
  test(`mounted route group "${group}" answers ${method} ${path} within ${RESPONSE_BUDGET_MS}ms`, async () => {
    const result = await requestWithin(path, { method, ...options });
    assert.ok(
      Number.isInteger(result.status),
      `${group}: expected an HTTP status code, received ${result.status}`,
    );
    assert.ok(
      result.status >= 100 && result.status < 600,
      `${group}: ${method} ${path} returned a non-HTTP status ${result.status}`,
    );
    assert.ok(
      result.elapsedMs < RESPONSE_BUDGET_MS,
      `${group}: ${method} ${path} took ${result.elapsedMs}ms (budget ${RESPONSE_BUDGET_MS}ms)`,
    );
  });
}

test('an unknown API path answers promptly instead of hanging', async () => {
  const result = await requestWithin('/api/definitely-not-a-route', { auth: token() });
  // Express's default 404 (or a route-level 404) — what matters is a real status
  // arriving inside the budget, not the exact code or body shape.
  assert.ok(
    result.status >= 400 && result.status < 600,
    `expected a 4xx/5xx for an unknown path, received ${result.status}`,
  );
  assert.ok(result.elapsedMs < RESPONSE_BUDGET_MS);
});
