import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-at-least-32-chars';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';

const { app } = await import('../server.js');
const { attachActor, requirePatientAccess } = await import('../security.js');

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
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
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

test('protected API routes reject requests without a token', async () => {
  const testServer = await startServer();
  try {
    const result = await request(testServer.baseUrl, '/api/analyze', { method: 'POST', body: {} });
    assert.equal(result.status, 401);
  } finally {
    await closeServer(testServer.server);
  }
});

test('expired and tampered tokens are rejected', async () => {
  const testServer = await startServer();
  try {
    const expired = await request(testServer.baseUrl, '/api/analyze', {
      method: 'POST',
      body: {},
      auth: token({ expiresIn: -1 }),
    });
    const valid = token();
    const tampered = `${valid.slice(0, -1)}${valid.endsWith('a') ? 'b' : 'a'}`;
    const tamperedResult = await request(testServer.baseUrl, '/api/analyze', {
      method: 'POST',
      body: {},
      auth: tampered,
    });
    assert.equal(expired.status, 401);
    assert.equal(tamperedResult.status, 401);
  } finally {
    await closeServer(testServer.server);
  }
});

test('a patient cannot access the clinician roster', async () => {
  const testServer = await startServer();
  try {
    const result = await request(testServer.baseUrl, '/api/clinician/roster', {
      auth: token({ id: 'patient-1', role: 'patient' }),
    });
    assert.equal(result.status, 403);
  } finally {
    await closeServer(testServer.server);
  }
});

test('a patient cannot read another patient\'s FHIR data', async () => {
  const testServer = await startServer();
  try {
    const result = await request(testServer.baseUrl, '/api/fhir/Patient/other-patient/vitals', {
      auth: token({ id: 'patient-1', role: 'patient' }),
    });
    assert.equal(result.status, 403);
  } finally {
    await closeServer(testServer.server);
  }
});

test('health remains public and trust proxy is configured', async () => {
  const testServer = await startServer();
  try {
    const result = await request(testServer.baseUrl, '/api/health');
    assert.equal(result.status, 200);
    assert.equal(app.get('trust proxy'), 2);
  } finally {
    await closeServer(testServer.server);
  }
});

test('proxy diagnostics are disabled by default', async () => {
  const previous = process.env.ENABLE_PROXY_DEBUG;
  delete process.env.ENABLE_PROXY_DEBUG;
  const testServer = await startServer();
  try {
    const result = await request(testServer.baseUrl, '/api/admin/proxy-debug', {
      auth: token({ id: 'admin-1', role: 'admin' }),
    });
    assert.equal(result.status, 404);
    assert.equal(result.body.error, 'Not found');
  } finally {
    if (previous === undefined) delete process.env.ENABLE_PROXY_DEBUG;
    else process.env.ENABLE_PROXY_DEBUG = previous;
    await closeServer(testServer.server);
  }
});

test('spoofed actor headers and patient body/query values are ignored', () => {
  const req = {
    headers: {
      'x-veda-user-id': 'attacker-selected-user',
      'x-veda-role': 'admin',
      'x-veda-tenant-id': 'attacker-tenant',
      'x-veda-patient-id': 'attacker-patient',
      'x-veda-ward-id': 'attacker-ward',
    },
    user: { id: 'patient-1', role: 'patient' },
    params: {},
    query: { patient_id: 'other-patient' },
    body: { patient_id: 'other-patient' },
  };
  let nextCalled = false;
  attachActor(req, {}, () => {});
  requirePatientAccess('READ')(req, { status: () => ({ json: () => {} }) }, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.actor, {
    userId: 'patient-1',
    role: 'patient',
    tenantId: 'default',
    patientId: 'patient-1',
    wardId: null,
  });
  assert.equal(req.patientId, 'patient-1');
});

after(() => {
  delete process.env.NODE_ENV;
  delete process.env.JWT_SECRET;
  delete process.env.JWT_ISSUER;
  delete process.env.JWT_AUDIENCE;
});