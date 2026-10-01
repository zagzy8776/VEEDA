import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

// This suite proves the SERVER refuses to compute adult-only clinical scores
// (NEWS2, qSOFA) for a request that declares a non-owner subject (a dependant)
// below the configured adult cutoff, or of unknown age. The cutoff comes from
// server config (ADULT_AGE_CUTOFF), never a Vite variable.
//
// Config is read when routes load, so it must be set before importing.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-at-least-32-chars';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';
process.env.DEFAULT_TENANT_ID = 'test-tenant';
// A clinician's configured cutoff. 18 here proves the gate reads config, not a
// hard-coded 16.
process.env.ADULT_AGE_CUTOFF = '18';

const {
  adultAgeCutoff,
  ageBand,
  adultScoresAllowed,
  resolveSubject,
  DEFAULT_ADULT_AGE_CUTOFF,
} = await import('../age-gate.js');
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

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

const COMPLETE_VITALS = {
  heartRate: 70,
  respiratoryRate: 16,
  oxygenSaturation: 98,
  temperature: 36.8,
  systolicBp: 120,
};

async function post(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token()}` },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

// ── The gate module itself ──

test('the cutoff reads SERVER config and defaults safely when absent', () => {
  assert.equal(adultAgeCutoff({ ADULT_AGE_CUTOFF: '18' }), 18);
  assert.equal(adultAgeCutoff({}), DEFAULT_ADULT_AGE_CUTOFF);
  assert.equal(adultAgeCutoff({ ADULT_AGE_CUTOFF: 'not-a-number' }), DEFAULT_ADULT_AGE_CUTOFF);
  // The live env in this suite is 18, proving config (not a literal) drives it.
  assert.equal(adultAgeCutoff(), 18);
});

test('ageBand classifies adult, child and unknown against a cutoff', () => {
  assert.equal(ageBand(30, 18), 'adult');
  assert.equal(ageBand(18, 18), 'adult');
  assert.equal(ageBand(17, 18), 'child');
  assert.equal(ageBand(0, 18), 'child');
  assert.equal(ageBand(null, 18), 'unknown');
  assert.equal(ageBand(undefined, 18), 'unknown');
  assert.equal(ageBand(Number.NaN, 18), 'unknown');
});

test('adult scores are allowed only for a KNOWN adult', () => {
  assert.equal(adultScoresAllowed(30, 18), true);
  assert.equal(adultScoresAllowed(17, 18), false, 'a child must not be scored');
  assert.equal(adultScoresAllowed(null, 18), false, 'an unknown age must not be scored');
});

test('resolveSubject treats an absent subject as the adult owner', () => {
  assert.deepEqual(resolveSubject({}), { declared: false, age: null });
  assert.deepEqual(resolveSubject({ vitals: {} }), { declared: false, age: null });
  assert.equal(resolveSubject({ subject: { type: 'self' } }).declared, false);
});

test('resolveSubject flags a declared dependant subject and its age', () => {
  assert.deepEqual(resolveSubject({ subject: { id: 'dep-1', age: 8 } }), { declared: true, age: 8 });
  assert.deepEqual(resolveSubject({ subject: { id: 'dep-1', age: null } }), { declared: true, age: null });
  // Back-compat: a bare age/dependentId at top level is a declared non-owner.
  assert.equal(resolveSubject({ age: 8 }).declared, true);
  assert.equal(resolveSubject({ dependentId: 'dep-1' }).declared, true);
});

// ── The route: /api/analyze refuses to compute adult scores for a child ──

test('POST /api/analyze computes NEWS2/qSOFA for an adult (owner) request', async () => {
  const testServer = await startServer();
  try {
    const result = await post(testServer.baseUrl, '/api/analyze', { vitals: COMPLETE_VITALS });
    assert.equal(result.status, 200);
    assert.equal(result.body.adultScoresAllowed, true);
    assert.ok(result.body.clinicalScores.news2, 'an adult owner must get a NEWS2 score');
    assert.equal(typeof result.body.clinicalScores.news2.total, 'number');
  } finally {
    await closeServer(testServer.server);
  }
});

test('POST /api/analyze refuses NEWS2/qSOFA for a child subject (below cutoff)', async () => {
  const testServer = await startServer();
  try {
    const result = await post(testServer.baseUrl, '/api/analyze', {
      vitals: COMPLETE_VITALS,
      subject: { id: 'dep-1', age: 8 },
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.adultScoresAllowed, false);
    assert.equal(result.body.clinicalScores.news2, null, 'no NEWS2 for a child');
    assert.equal(result.body.clinicalScores.qsofa, null, 'no qSOFA for a child');
    assert.match(result.body.subjectNote, /not validated for children/i);
  } finally {
    await closeServer(testServer.server);
  }
});

test('POST /api/analyze refuses adult scores for an UNKNOWN-age subject', async () => {
  const testServer = await startServer();
  try {
    const result = await post(testServer.baseUrl, '/api/analyze', {
      vitals: COMPLETE_VITALS,
      subject: { id: 'dep-1' },
    });
    assert.equal(result.body.adultScoresAllowed, false);
    assert.equal(result.body.clinicalScores.news2, null);
    assert.equal(result.body.clinicalScores.qsofa, null);
  } finally {
    await closeServer(testServer.server);
  }
});

// ── The route: /api/triage/referral refuses to score a child ──

test('POST /api/triage/referral refuses a referral band for a child subject', async () => {
  const testServer = await startServer();
  try {
    const result = await post(testServer.baseUrl, '/api/triage/referral', {
      vitals: COMPLETE_VITALS,
      subject: { id: 'dep-1', age: 8 },
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.news2, null, 'no NEWS2 for a child');
    assert.equal(result.body.adultScoresAllowed, false);
    assert.equal(result.body.referral.action, 'unavailable');
    assert.match(result.body.referral.reason, /not validated for children/i);
  } finally {
    await closeServer(testServer.server);
  }
});

test('POST /api/triage/referral refuses a referral band for an unknown-age subject', async () => {
  const testServer = await startServer();
  try {
    const result = await post(testServer.baseUrl, '/api/triage/referral', {
      vitals: COMPLETE_VITALS,
      subject: { id: 'dep-1' },
    });
    assert.equal(result.body.news2, null);
    assert.equal(result.body.referral.action, 'unavailable');
  } finally {
    await closeServer(testServer.server);
  }
});
