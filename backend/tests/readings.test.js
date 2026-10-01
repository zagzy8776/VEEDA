import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { readFile } from 'node:fs/promises';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-at-least-32-chars';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';
process.env.DEFAULT_TENANT_ID = 'test-tenant';

const { validateReadingInput, toRow } = await import('../readings-validate.js');
const { createReadingsRouter } = await import('../routes/readings.js');
const { requireAuth, attachActor } = await import('../security.js');

const TEST_SECRET = process.env.JWT_SECRET;
const USER = '11111111-1111-1111-1111-111111111111';

function token(userId = USER, role = 'patient') {
  return jwt.sign({ sub: userId, role }, TEST_SECRET, {
    issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE, expiresIn: '15m',
  });
}

// ── The server repeats the client's impossible-value checks ──
test('a valid blood-pressure reading passes and a swapped pair is rejected', () => {
  assert.equal(validateReadingInput({ clientId: 'c1', kind: 'blood_pressure', systolic: 120, diastolic: 80, source: 'typed_in', recordedAt: '2026-01-01T00:00:00Z' }).ok, true);
  assert.equal(validateReadingInput({ clientId: 'c2', kind: 'blood_pressure', systolic: 80, diastolic: 120, source: 'typed_in', recordedAt: '2026-01-01T00:00:00Z' }).ok, false);
  assert.equal(validateReadingInput({ clientId: 'c3', kind: 'blood_pressure', systolic: 1200, diastolic: 80, source: 'typed_in', recordedAt: '2026-01-01T00:00:00Z' }).ok, false);
});

test('glucose is bounded per unit and the unit must be known', () => {
  assert.equal(validateReadingInput({ clientId: 'g1', kind: 'blood_glucose', value: 5.5, unit: 'mmol/L', source: 'typed_in', recordedAt: '2026-01-01T00:00:00Z' }).ok, true);
  assert.equal(validateReadingInput({ clientId: 'g2', kind: 'blood_glucose', value: 1200, unit: 'mg/dL', source: 'typed_in', recordedAt: '2026-01-01T00:00:00Z' }).ok, false);
  assert.equal(validateReadingInput({ clientId: 'g3', kind: 'blood_glucose', value: 5, unit: 'furlongs', source: 'typed_in', recordedAt: '2026-01-01T00:00:00Z' }).ok, false);
});

test('a missing clientId, bad source, or bad timestamp is rejected', () => {
  assert.equal(validateReadingInput({ kind: 'blood_pressure', systolic: 120, diastolic: 80, source: 'typed_in', recordedAt: '2026-01-01T00:00:00Z' }).ok, false);
  assert.equal(validateReadingInput({ clientId: 'x', kind: 'blood_pressure', systolic: 120, diastolic: 80, source: 'guessed', recordedAt: '2026-01-01T00:00:00Z' }).ok, false);
  assert.equal(validateReadingInput({ clientId: 'x', kind: 'blood_pressure', systolic: 120, diastolic: 80, source: 'typed_in', recordedAt: 'not-a-date' }).ok, false);
});

test('toRow keeps the sent unit and never infers it', () => {
  const row = toRow({ kind: 'blood_glucose', value: 5.5, unit: 'mmol/L', context: 'fasting' });
  assert.equal(row.unit, 'mmol/L');
  assert.equal(row.context, 'fasting');
  const bp = toRow({ kind: 'blood_pressure', systolic: 120, diastolic: 80 });
  assert.equal(bp.unit, 'mmHg');
  assert.equal(bp.value, null);
});

// ── The route: idempotent upsert and tenant from server config ──
function createReadingsDb() {
  const inserted = [];
  const audits = [];
  const dependents = [{ id: 'dep-1', guardian_user_id: USER }];
  return {
    inserted, audits,
    async query(text, params = []) {
      const sql = text.replace(/\s+/g, ' ').trim();
      if (sql.startsWith('SELECT id FROM dependents')) {
        return { rows: dependents.filter((d) => d.id === params[0] && d.guardian_user_id === params[1]).map((d) => ({ id: d.id })) };
      }
      if (sql.startsWith('INSERT INTO readings')) { inserted.push(params); return { rows: [] }; }
      if (sql.startsWith('INSERT INTO audit_logs')) { audits.push({ userId: params[1], action: params[3] }); return { rows: [] }; }
      if (sql.startsWith('SELECT client_id')) return { rows: [] };
      if (sql.startsWith('DELETE FROM readings')) return { rows: [] };
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
    async connect() { return { query: (t, p) => this.query(t, p), release() {} }; },
  };
}

async function startApp(db) {
  const app = express();
  app.use(express.json());
  app.use(attachActor);
  app.use('/api', (req, res, next) => requireAuth(req, res, next));
  app.use('/api', createReadingsRouter({ db }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('POST /api/readings upserts valid readings, reports rejected ones, and takes tenant from config', async () => {
  const db = createReadingsDb();
  const { server, baseUrl } = await startApp(db);
  try {
    const res = await fetch(`${baseUrl}/api/readings`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ readings: [
        { clientId: 'c1', kind: 'blood_pressure', systolic: 120, diastolic: 80, source: 'typed_in', recordedAt: '2026-01-01T00:00:00Z' },
        { clientId: 'c2', kind: 'blood_glucose', value: 1200, unit: 'mg/dL', source: 'typed_in', recordedAt: '2026-01-01T00:00:00Z' },
      ] }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.accepted, ['c1']);
    assert.equal(body.rejected.length, 1);
    assert.equal(body.rejected[0].clientId, 'c2');
    // The row was written with the server tenant, not anything from the client.
    assert.equal(db.inserted.length, 1);
    assert.equal(db.inserted[0][2], 'test-tenant');
    assert.equal(db.inserted[0][0], USER);
  } finally { await closeServer(server); }
});

test('POST /api/readings refuses a dependent that is not this guardian’s', async () => {
  const db = createReadingsDb();
  const { server, baseUrl } = await startApp(db);
  try {
    const res = await fetch(`${baseUrl}/api/readings`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ readings: [
        { clientId: 'c1', kind: 'blood_pressure', systolic: 120, diastolic: 80, source: 'typed_in', recordedAt: '2026-01-01T00:00:00Z', dependentId: 'dep-999' },
      ] }),
    });
    const body = await res.json();
    assert.deepEqual(body.accepted, []);
    assert.equal(body.rejected[0].error, 'unknown dependent');
    assert.equal(db.inserted.length, 0);
  } finally { await closeServer(server); }
});

test('migration 008 creates readings with an idempotent per-owner client key', async () => {
  const migration = await readFile(new URL('../migrations/008_readings.sql', import.meta.url), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS readings/);
  assert.match(migration, /UNIQUE \(owner_user_id, client_id\)/);
  assert.match(migration, /owner_user_id\s+UUID\s+NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
});
