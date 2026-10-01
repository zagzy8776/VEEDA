import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

// This suite runs the real /api/analyze route over HTTP. It verifies that the
// safety line the user sees is never blank and that the emergency number comes
// from verified configuration (EMERGENCY_NUMBER) and is never hard-coded.
//
// EMERGENCY_NUMBER is read when the route module loads, so it must be set
// before importing server.js — exactly like the existing auth tests set
// JWT_SECRET before import.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-at-least-32-chars';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';
const CONFIGURED_NUMBER = '999';
process.env.EMERGENCY_NUMBER = CONFIGURED_NUMBER;

const { app } = await import('../server.js');

function token({ id = 'patient-1', role = 'patient' } = {}) {
  return jwt.sign(
    { sub: id, role },
    process.env.JWT_SECRET,
    { issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE, expiresIn: '15m' },
  );
}

async function startServer() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function analyze(baseUrl, vitals) {
  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token()}` },
    body: JSON.stringify({ vitals, symptoms: [] }),
  });
  return { status: response.status, body: await response.json() };
}

test('when the engine cannot evaluate, the screen still tells the user to get help', async () => {
  const testServer = await startServer();
  try {
    // Only a heart rate: every other observation is missing, so NEWS2 is
    // incomplete and the engine cannot produce a usable recommendation. This is
    // the state that used to render as a calm screen with no safety line.
    const result = await analyze(testServer.baseUrl, { heartRate: 78 });
    assert.equal(result.status, 200);
    assert.equal(result.body.evaluated, false);

    // The safety line must never be blank and must point at real help.
    assert.equal(typeof result.body.safetyNotice, 'string');
    assert.ok(result.body.safetyNotice.length > 0, 'safetyNotice must not be empty');
    assert.match(result.body.safetyNotice, /get medical help now/i);
    assert.match(result.body.safetyNotice, /feel very unwell/i);

    // The number comes from verified configuration, not a literal in the code.
    assert.equal(result.body.emergencyNumber, CONFIGURED_NUMBER);
    assert.match(result.body.safetyNotice, new RegExp(CONFIGURED_NUMBER));

    // The headline must not read as a false all-clear.
    assert.doesNotMatch(result.body.headline, /within a typical range/i);
  } finally {
    await new Promise((resolve, reject) => testServer.server.close((error) => error ? reject(error) : resolve()));
  }
});

test('a complete, calm reading also keeps a plain safety line on screen', async () => {
  const testServer = await startServer();
  try {
    const result = await analyze(testServer.baseUrl, {
      heartRate: 70,
      respiratoryRate: 16,
      oxygenSaturation: 98,
      temperature: 36.8,
      systolicBp: 120,
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.evaluated, true);
    assert.equal(result.body.riskLevel, 'Stable');
    // Even when everything is calm the emergency guidance is present, never null.
    assert.equal(typeof result.body.safetyNotice, 'string');
    assert.ok(result.body.safetyNotice.length > 0);
    assert.match(result.body.safetyNotice, new RegExp(CONFIGURED_NUMBER));
    assert.equal(result.body.emergencyNumber, CONFIGURED_NUMBER);
  } finally {
    await new Promise((resolve, reject) => testServer.server.close((error) => error ? reject(error) : resolve()));
  }
});
