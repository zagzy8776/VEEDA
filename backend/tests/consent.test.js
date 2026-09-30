import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-at-least-32-chars';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';

const { app } = await import('../server.js');
const { normalizeConsentInput, CONSENT_FEATURES, CONSENT_UPSERT_SQL } = await import('../consent-store.js');

const SECRET = process.env.JWT_SECRET;

function token({ id = 'patient-1', role = 'patient', expiresIn = '15m' } = {}) {
  return jwt.sign(
    { sub: id, role },
    SECRET,
    { issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE, expiresIn },
  );
}

async function startServer() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function request(baseUrl, path, { method = 'GET', body, auth } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth) headers.authorization = `Bearer ${auth}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

// --- pure validation ---

test('normalizeConsentInput accepts a well-formed grant', () => {
  const result = normalizeConsentInput({ feature: 'health_data', version: 'v1', granted: true });
  assert.equal(result.ok, true);
  assert.deepEqual(result.record, { feature: 'health_data', consentVersion: 'v1', granted: true });
});

test('normalizeConsentInput trims the version and keeps granted false', () => {
  const result = normalizeConsentInput({ feature: 'sharing', version: '  v2  ', granted: false });
  assert.equal(result.ok, true);
  assert.equal(result.record.consentVersion, 'v2');
  assert.equal(result.record.granted, false);
});

test('normalizeConsentInput rejects an unknown feature', () => {
  const result = normalizeConsentInput({ feature: 'teleportation', version: 'v1', granted: true });
  assert.equal(result.ok, false);
  assert.match(result.error, /Unknown consent feature/);
});

test('normalizeConsentInput rejects a missing version', () => {
  const result = normalizeConsentInput({ feature: 'health_data', granted: true });
  assert.equal(result.ok, false);
  assert.match(result.error, /version is required/);
});

test('normalizeConsentInput requires granted to be a boolean (no truthy coercion)', () => {
  const result = normalizeConsentInput({ feature: 'health_data', version: 'v1', granted: 'yes' });
  assert.equal(result.ok, false);
  assert.match(result.error, /granted must be a boolean/);
});

test('normalizeConsentInput rejects a non-object payload', () => {
  assert.equal(normalizeConsentInput(null).ok, false);
  assert.equal(normalizeConsentInput('nope').ok, false);
});

test('the known consent features are the expected set', () => {
  assert.deepEqual(CONSENT_FEATURES, ['health_data', 'camera_analysis', 'sharing', 'reminders']);
});

test('the upsert keeps one row per (user, feature, version)', () => {
  assert.match(CONSENT_UPSERT_SQL, /ON CONFLICT \(user_id, feature, consent_version\)/);
  assert.match(CONSENT_UPSERT_SQL, /DO UPDATE SET granted/);
});

// --- HTTP surface (auth + validation; DB is not required for these paths) ---

test('POST /api/consent requires authentication', async () => {
  const testServer = await startServer();
  try {
    const result = await request(testServer.baseUrl, '/api/consent', {
      method: 'POST',
      body: { feature: 'health_data', version: 'v1', granted: true },
    });
    assert.equal(result.status, 401);
  } finally {
    await closeServer(testServer.server);
  }
});

test('POST /api/consent rejects an invalid body before touching the database', async () => {
  const testServer = await startServer();
  try {
    const result = await request(testServer.baseUrl, '/api/consent', {
      method: 'POST',
      auth: token(),
      body: { feature: 'health_data', version: 'v1', granted: 'maybe' },
    });
    assert.equal(result.status, 400);
    assert.match(result.body.error, /granted must be a boolean/);
  } finally {
    await closeServer(testServer.server);
  }
});

test('GET /api/consent requires authentication', async () => {
  const testServer = await startServer();
  try {
    const result = await request(testServer.baseUrl, '/api/consent');
    assert.equal(result.status, 401);
  } finally {
    await closeServer(testServer.server);
  }
});
