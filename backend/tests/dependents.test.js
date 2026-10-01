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

const { createDependentsRouter } = await import('../routes/dependents.js');
const { requireAuth, attachActor } = await import('../security.js');

const TEST_SECRET = process.env.JWT_SECRET;
const GUARDIAN = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

function token(userId = GUARDIAN, role = 'patient') {
  return jwt.sign({ sub: userId, role }, TEST_SECRET, {
    issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE, expiresIn: '15m',
  });
}

// A dependant is managed by exactly one guardian. These tests pin that every
// query is scoped by guardian_user_id, so one guardian can never see or change
// another's family profiles. They also pin that the stored value is a BIRTH YEAR
// (so the age stays correct over time) and that a newly added dependant's age is
// stamped as confirmed.
function createDb() {
  const rows = [];
  const audits = [];
  const publicFields = (r) => ({
    id: r.id, display_name: r.display_name, birth_year: r.birth_year, birth_month: r.birth_month,
    age_confirmed: r.age_confirmed, age_confirmed_at: r.age_confirmed_at, created_at: 'x',
  });
  return {
    rows, audits,
    async query(text, params = []) {
      const sql = text.replace(/\s+/g, ' ').trim();
      if (sql.startsWith('INSERT INTO dependents')) {
        const row = {
          id: `dep-${rows.length + 1}`, guardian_user_id: params[0], tenant_id: params[1], display_name: params[2],
          birth_year: params[3], birth_month: params[4], age_confirmed: params[5], age_confirmed_at: '2026-01-01T00:00:00Z',
        };
        rows.push(row);
        return { rows: [publicFields(row)] };
      }
      if (sql.startsWith('SELECT id, display_name, birth_year')) {
        return { rows: rows.filter((r) => r.guardian_user_id === params[0]).map(publicFields) };
      }
      if (sql.startsWith('DELETE FROM dependents')) {
        const index = rows.findIndex((r) => r.id === params[0] && r.guardian_user_id === params[1]);
        if (index === -1) return { rows: [] };
        rows.splice(index, 1);
        return { rows: [{ id: params[0] }] };
      }
      if (sql.startsWith('INSERT INTO audit_logs')) { audits.push(params[3]); return { rows: [] }; }
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
  app.use('/api', createDependentsRouter({ db }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('a guardian can add a dependant, list it, and it is tenant-scoped from config', async () => {
  const db = createDb();
  const { server, baseUrl } = await startApp(db);
  try {
    const created = await fetch(`${baseUrl}/api/dependents`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Sam', birthYear: 2018, birthMonth: 4 }),
    });
    assert.equal(created.status, 201);
    const body = await created.json();
    assert.equal(body.dependent.display_name, 'Sam');
    // The stored value is a BIRTH YEAR, not a frozen age, and the server derives
    // an age for display.
    assert.equal(db.rows[0].birth_year, 2018);
    assert.equal(db.rows[0].birth_month, 4);
    assert.equal(db.rows[0].tenant_id, 'test-tenant');
    assert.equal(body.dependent.age_confirmed, true, 'a carer-entered age is confirmed');
    assert.equal(typeof body.dependent.age, 'number');
    assert.equal('age' in db.rows[0], false, 'no stale age column is written');

    const listed = await fetch(`${baseUrl}/api/dependents`, { headers: { authorization: `Bearer ${token()}` } });
    const listedBody = await listed.json();
    assert.equal(listedBody.dependents.length, 1);
    assert.equal(listedBody.dependents[0].birth_year, 2018);
  } finally { await closeServer(server); }
});

test('a legacy age input is accepted but stored as a birth year, not a frozen age', async () => {
  const db = createDb();
  const { server, baseUrl } = await startApp(db);
  try {
    const created = await fetch(`${baseUrl}/api/dependents`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Sam', age: 8 }),
    });
    assert.equal(created.status, 201);
    assert.equal(db.rows[0].birth_year, new Date().getFullYear() - 8, 'age is converted to a birth year');
  } finally { await closeServer(server); }
});

test('one guardian never sees another guardian’s dependants', async () => {
  const db = createDb();
  db.rows.push({ id: 'dep-1', guardian_user_id: GUARDIAN, tenant_id: 'test-tenant', display_name: 'Sam', birth_year: 2018, birth_month: null, age_confirmed: true, age_confirmed_at: '2026-01-01T00:00:00Z' });
  const { server, baseUrl } = await startApp(db);
  try {
    const otherList = await fetch(`${baseUrl}/api/dependents`, { headers: { authorization: `Bearer ${token(OTHER)}` } });
    assert.equal((await otherList.json()).dependents.length, 0);

    const del = await fetch(`${baseUrl}/api/dependents/dep-1`, { method: 'DELETE', headers: { authorization: `Bearer ${token(OTHER)}` } });
    assert.equal(del.status, 404);
    assert.equal(db.rows.length, 1, 'the other guardian’s row is untouched');
  } finally { await closeServer(server); }
});

test('a name is required and an out-of-range birth year or month is refused', async () => {
  const db = createDb();
  const { server, baseUrl } = await startApp(db);
  try {
    const noName = await fetch(`${baseUrl}/api/dependents`, {
      method: 'POST', headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' }, body: JSON.stringify({ birthYear: 2018 }),
    });
    assert.equal(noName.status, 400);

    const badYear = await fetch(`${baseUrl}/api/dependents`, {
      method: 'POST', headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' }, body: JSON.stringify({ displayName: 'Sam', birthYear: 1500 }),
    });
    assert.equal(badYear.status, 400);

    const badMonth = await fetch(`${baseUrl}/api/dependents`, {
      method: 'POST', headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' }, body: JSON.stringify({ displayName: 'Sam', birthYear: 2018, birthMonth: 13 }),
    });
    assert.equal(badMonth.status, 400);
  } finally { await closeServer(server); }
});

test('migration 009 keys dependants to the guardian only and adds a nullable reading FK', async () => {
  const migration = await readFile(new URL('../migrations/009_dependents.sql', import.meta.url), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS dependents/);
  assert.match(migration, /guardian_user_id\s+UUID NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
  // No email/password/user link column: a dependant is never a user. Check the
  // executable statements only (the comment explains this must stay true).
  const statements = migration
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  assert.doesNotMatch(statements, /password|email|display_name\s+.*user/i);
  assert.match(migration, /ALTER TABLE readings\s+ADD COLUMN IF NOT EXISTS dependent_id UUID/);
  assert.match(migration, /REFERENCES dependents\(id\) ON DELETE CASCADE/);
});

test('migration 011 replaces the frozen age with a birth year and a confirmation stamp', async () => {
  const migration = await readFile(new URL('../migrations/011_dependents_birth_year.sql', import.meta.url), 'utf8');
  assert.match(migration, /ADD COLUMN IF NOT EXISTS birth_year INTEGER/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS birth_month INTEGER/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS age_confirmed BOOLEAN NOT NULL DEFAULT false/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ/);
  // The old frozen age is backfilled approximately and then dropped.
  assert.match(migration, /EXTRACT\(YEAR FROM created_at\)::int - age/);
  assert.match(migration, /DROP COLUMN IF EXISTS age/);
  assert.match(migration, /age_confirmed = false/, 'backfilled rows are marked unconfirmed');
});
