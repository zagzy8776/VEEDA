import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

// Same route as analyze-fallback.test.js, but with NO EMERGENCY_NUMBER in the
// environment. This proves the server never guesses a number and still shows a
// plain instruction to get help. It is a separate file because the route reads
// the value once at import time.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-at-least-32-chars';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';
delete process.env.EMERGENCY_NUMBER;

const { app } = await import('../server.js');

function token() {
  return jwt.sign(
    { sub: 'patient-1', role: 'patient' },
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

test('with no configured number the safety line is plain and never guesses a number', async () => {
  const testServer = await startServer();
  try {
    const response = await fetch(`${testServer.baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token()}` },
      body: JSON.stringify({ vitals: { heartRate: 78 }, symptoms: [] }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.evaluated, false);
    assert.equal(body.emergencyNumber, null);
    assert.equal(typeof body.safetyNotice, 'string');
    assert.ok(body.safetyNotice.length > 0);
    assert.match(body.safetyNotice, /get medical help now/i);
    // It falls back to a phrase, not a guessed dialable number.
    assert.match(body.safetyNotice, /local emergency number/i);
  } finally {
    await new Promise((resolve, reject) => testServer.server.close((error) => error ? reject(error) : resolve()));
  }
});
