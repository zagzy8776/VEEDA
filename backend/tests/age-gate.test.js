import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import jwt from 'jsonwebtoken';

// This suite proves the SERVER refuses to compute adult-only clinical scores
// (NEWS2, qSOFA) for a request that is about a dependant below the configured
// adult cutoff, or of unknown age — and that the server works out WHO the
// subject is itself, from the dependants table, rather than trusting the client.
// The cutoff comes from server config (ADULT_AGE_CUTOFF), never a Vite variable.
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
  ageFromBirthYear,
  ageConfirmationCurrent,
  dependentRef,
  resolveAdultGate,
  DEFAULT_ADULT_AGE_CUTOFF,
  DEFAULT_AGE_RECONFIRM_MONTHS,
} = await import('../age-gate.js');
const { createAnalyzeRouter } = await import('../routes/analyze.js');
const { createTriageRouter } = await import('../routes/triage.js');
const { requireAuth, attachActor } = await import('../security.js');

const GUARDIAN = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

function token({ id = GUARDIAN, role = 'patient' } = {}) {
  return jwt.sign(
    { sub: id, role },
    process.env.JWT_SECRET,
    { issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE, expiresIn: '15m' },
  );
}

// A stand-in for the dependants table ONLY: it answers the guardian-scoped
// lookup the gate performs, so a guardian can never read another's dependant.
// Records may be given either as `{ birth_year, birth_month, age_confirmed,
// age_confirmed_at }` (the real stored shape) or with an `age` shorthand, which
// is converted to a birth year confirmed "just now" so the intent of a test
// reads as the age the dependant is today.
function confirmedNow() {
  return { age_confirmed: true, age_confirmed_at: new Date().toISOString() };
}

function normRecord(d) {
  if (d.birth_year !== undefined || d.age_confirmed !== undefined) {
    return { birth_month: null, ...confirmedNow(), ...d };
  }
  if (d.age == null) return { ...d, birth_year: null, birth_month: null, age_confirmed: false, age_confirmed_at: null };
  return { ...d, birth_year: new Date().getFullYear() - d.age, birth_month: null, ...confirmedNow() };
}

function createDb(dependents = []) {
  const records = dependents.map(normRecord);
  return {
    dependents: records,
    async query(text, params = []) {
      const sql = text.replace(/\s+/g, ' ').trim();
      if (sql.startsWith('SELECT birth_year, birth_month, age_confirmed, age_confirmed_at FROM dependents')) {
        const [id, guardian] = params;
        return {
          rows: records
            .filter((d) => String(d.id) === String(id) && String(d.guardian_user_id) === String(guardian))
            .map((d) => ({
              birth_year: d.birth_year, birth_month: d.birth_month,
              age_confirmed: d.age_confirmed, age_confirmed_at: d.age_confirmed_at,
            })),
        };
      }
      if (sql.startsWith('INSERT INTO audit_logs')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

// The real routers over a fake db, authenticated exactly like the server mounts
// them: requireAuth populates req.user, and the routers read req.user.id.
function startApp(db) {
  const app = express();
  app.use(express.json());
  app.use(attachActor);
  app.use('/api', (req, res, next) => requireAuth(req, res, next));
  app.use('/api', createAnalyzeRouter({ db }));
  app.use('/api', createTriageRouter({ db }));
  return app;
}

async function startServer(db) {
  const server = http.createServer(startApp(db));
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

async function post(baseUrl, path, body, user = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token(user)}` },
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

test('age is computed from a birth year at request time, not frozen', () => {
  const at = (y, m) => new Date(Date.UTC(y, m - 1, 15));
  // No birth month: the birthday is assumed to have passed (the higher age).
  assert.equal(ageFromBirthYear(2008, null, at(2026, 6)), 18);
  // With a birth month still to come this year, the person is one younger.
  assert.equal(ageFromBirthYear(2008, 12, at(2026, 6)), 17);
  // Once the month has passed, the higher age applies.
  assert.equal(ageFromBirthYear(2008, 1, at(2026, 6)), 18);
  // No usable birth year -> unknown.
  assert.equal(ageFromBirthYear(null, null, at(2026, 6)), null);
  assert.equal(ageFromBirthYear(3000, null, at(2026, 6)), null, 'a future birth year is unusable');
});

test('a dependant crosses the adult cutoff as time passes', () => {
  // Born in 2010: a child at 17 in 2027, an adult at 18 in 2028. The SAME stored
  // birth year gives different bands as the clock moves — the point of storing a
  // birth year rather than a frozen age.
  const born = 2010;
  assert.equal(adultScoresAllowed(ageFromBirthYear(born, null, new Date(Date.UTC(2027, 5, 15))), 18), false);
  assert.equal(adultScoresAllowed(ageFromBirthYear(born, null, new Date(Date.UTC(2028, 5, 15))), 18), true);
});

test('an age confirmation is only trusted inside the re-confirm interval', () => {
  const now = new Date(Date.UTC(2026, 5, 15));
  const fresh = new Date(Date.UTC(2026, 5, 1)).toISOString();
  const stale = new Date(Date.UTC(2023, 5, 1)).toISOString();
  assert.equal(ageConfirmationCurrent({ ageConfirmed: true, ageConfirmedAt: fresh }, now, 12), true);
  assert.equal(ageConfirmationCurrent({ ageConfirmed: true, ageConfirmedAt: stale }, now, 12), false);
  assert.equal(ageConfirmationCurrent({ ageConfirmed: false, ageConfirmedAt: fresh }, now, 12), false, 'an unconfirmed record is unknown');
  assert.equal(ageConfirmationCurrent({ ageConfirmed: true, ageConfirmedAt: null }, now, 12), false, 'a missing stamp is unknown');
});

test('dependentRef finds the dependant a request is about, ignoring declared age', () => {
  assert.deepEqual(dependentRef({}), { isDependent: false, dependentId: null });
  assert.deepEqual(dependentRef({ vitals: {} }), { isDependent: false, dependentId: null });
  assert.deepEqual(dependentRef({ subject: { type: 'self' } }), { isDependent: false, dependentId: null });
  assert.deepEqual(dependentRef({ subject: { id: 'self' } }), { isDependent: false, dependentId: null });
  assert.deepEqual(dependentRef({ subject: { id: 'dep-1' } }), { isDependent: true, dependentId: 'dep-1' });
  assert.deepEqual(dependentRef({ dependentId: 'dep-1' }), { isDependent: true, dependentId: 'dep-1' });
  assert.deepEqual(dependentRef({ dependent_id: 'dep-1' }), { isDependent: true, dependentId: 'dep-1' });
});

test('resolveAdultGate treats no dependent reference as the adult owner', async () => {
  const db = createDb();
  assert.deepEqual(await resolveAdultGate({}, { guardianUserId: GUARDIAN, db }), {
    declared: false, age: null, owned: true, dependentId: null,
  });
  assert.equal((await resolveAdultGate({ vitals: {} }, { guardianUserId: GUARDIAN, db })).declared, false);
});

test('resolveAdultGate takes the age from the SERVER record, not the client', async () => {
  const db = createDb([{ id: 'dep-1', guardian_user_id: GUARDIAN, age: 8 }]);
  // The client lies that the dependant is 40; the server still sees 8.
  const result = await resolveAdultGate(
    { dependentId: 'dep-1', age: 40, subject: { id: 'dep-1', age: 40 } },
    { guardianUserId: GUARDIAN, db },
  );
  assert.deepEqual(result, { declared: true, age: 8, owned: true, dependentId: 'dep-1' });
});

test('resolveAdultGate treats a dependant with no birth year as unknown', async () => {
  const db = createDb([{ id: 'dep-1', guardian_user_id: GUARDIAN, age: null }]);
  const result = await resolveAdultGate({ dependentId: 'dep-1' }, { guardianUserId: GUARDIAN, db });
  assert.deepEqual(result, { declared: true, age: null, owned: true, dependentId: 'dep-1' });
});

test('resolveAdultGate treats a stale (unconfirmed) age as unknown', async () => {
  // Confirmed more than the re-confirm interval ago: the record can no longer be
  // trusted, so the dependant is UNKNOWN age and gets no adult scores.
  const longAgo = new Date();
  longAgo.setMonth(longAgo.getMonth() - (DEFAULT_AGE_RECONFIRM_MONTHS + 1));
  const db = createDb([{ id: 'dep-1', guardian_user_id: GUARDIAN, birth_year: 1990, age_confirmed: true, age_confirmed_at: longAgo.toISOString() }]);
  const result = await resolveAdultGate({ dependentId: 'dep-1' }, { guardianUserId: GUARDIAN, db });
  assert.deepEqual(result, { declared: true, age: null, owned: true, dependentId: 'dep-1' });
});

test("resolveAdultGate reports another guardian's dependant as not owned", async () => {
  const db = createDb([{ id: 'dep-1', guardian_user_id: OTHER, age: 30 }]);
  const result = await resolveAdultGate({ dependentId: 'dep-1' }, { guardianUserId: GUARDIAN, db });
  assert.equal(result.owned, false);
});

test('resolveAdultGate fails closed when there is no database to verify against', async () => {
  const result = await resolveAdultGate({ dependentId: 'dep-1' }, { guardianUserId: GUARDIAN, db: null });
  assert.deepEqual(result, { declared: true, age: null, owned: true, dependentId: 'dep-1' });
});

// ── The route: /api/analyze refuses to compute adult scores for a child ──

test('POST /api/analyze computes NEWS2/qSOFA for an adult (owner) request', async () => {
  const db = createDb();
  const testServer = await startServer(db);
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
  const db = createDb([{ id: 'dep-1', guardian_user_id: GUARDIAN, age: 8 }]);
  const testServer = await startServer(db);
  try {
    const result = await post(testServer.baseUrl, '/api/analyze', {
      vitals: COMPLETE_VITALS,
      subject: { id: 'dep-1' },
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

test('POST /api/analyze refuses adult scores for an UNKNOWN-age dependant', async () => {
  const db = createDb([{ id: 'dep-1', guardian_user_id: GUARDIAN, age: null }]);
  const testServer = await startServer(db);
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
  const db = createDb([{ id: 'dep-1', guardian_user_id: GUARDIAN, age: 8 }]);
  const testServer = await startServer(db);
  try {
    const result = await post(testServer.baseUrl, '/api/triage/referral', {
      vitals: COMPLETE_VITALS,
      subject: { id: 'dep-1' },
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

test('POST /api/triage/referral refuses a referral band for an unknown-age dependant', async () => {
  const db = createDb([{ id: 'dep-1', guardian_user_id: GUARDIAN, age: null }]);
  const testServer = await startServer(db);
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

// ── The server works out the subject itself; the client cannot forge it ──

test('a dependant child with NO declared subject still gets no scores', async () => {
  // The request names the dependant only by dependent_id, with no `subject` and
  // no age at all. The server must still look the dependant up and refuse.
  const db = createDb([{ id: 'dep-1', guardian_user_id: GUARDIAN, age: 7 }]);
  const testServer = await startServer(db);
  try {
    const result = await post(testServer.baseUrl, '/api/analyze', {
      vitals: COMPLETE_VITALS,
      dependent_id: 'dep-1',
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.adultScoresAllowed, false, 'a dependent_id alone is enough to gate');
    assert.equal(result.body.clinicalScores.news2, null);
    assert.equal(result.body.clinicalScores.qsofa, null);
  } finally {
    await closeServer(testServer.server);
  }
});

test("a forged 'adult' declaration on a child's dependent_id still gets no scores", async () => {
  // The stored record says the dependant is 7; the client claims 40 and stamps a
  // non-self adult subject. The server must ignore both and use its own record.
  const db = createDb([{ id: 'dep-1', guardian_user_id: GUARDIAN, age: 7 }]);
  const testServer = await startServer(db);
  try {
    const result = await post(testServer.baseUrl, '/api/analyze', {
      vitals: COMPLETE_VITALS,
      dependent_id: 'dep-1',
      age: 40,
      subject: { id: 'dep-1', age: 40, type: 'adult' },
    });
    assert.equal(result.body.adultScoresAllowed, false, 'the client-declared age is ignored');
    assert.equal(result.body.clinicalScores.news2, null);
    assert.equal(result.body.clinicalScores.qsofa, null);

    const referral = await post(testServer.baseUrl, '/api/triage/referral', {
      vitals: COMPLETE_VITALS,
      dependent_id: 'dep-1',
      age: 40,
    });
    assert.equal(referral.body.news2, null);
    assert.equal(referral.body.referral.action, 'unavailable');
  } finally {
    await closeServer(testServer.server);
  }
});

test("another user's dependent_id is rejected outright", async () => {
  // The dependant belongs to OTHER, not to the signed-in GUARDIAN.
  const db = createDb([{ id: 'dep-1', guardian_user_id: OTHER, age: 30 }]);
  const testServer = await startServer(db);
  try {
    const analyze = await post(testServer.baseUrl, '/api/analyze', {
      vitals: COMPLETE_VITALS,
      dependent_id: 'dep-1',
    });
    assert.equal(analyze.status, 403, 'a dependent_id the caller does not own is refused');

    const referral = await post(testServer.baseUrl, '/api/triage/referral', {
      vitals: COMPLETE_VITALS,
      dependent_id: 'dep-1',
    });
    assert.equal(referral.status, 403);
  } finally {
    await closeServer(testServer.server);
  }
});
