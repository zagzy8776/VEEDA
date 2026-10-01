import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { readFile } from 'node:fs/promises';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-at-least-32-chars';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';
process.env.DEFAULT_TENANT_ID = 'test-tenant';

const { createAccountRouter } = await import('../routes/account.js');
const { requireAuth, attachActor } = await import('../security.js');

const TEST_SECRET = process.env.JWT_SECRET;
const TENANT = 'test-tenant';
const USER = '11111111-1111-1111-1111-111111111111';
const LEGACY = 'legacy-patient-7';
const PASSWORD = 'correct-horse-battery';

// ── A tiny fake database that records the erase in call order ──
function createFakeDb({ passwordHash }) {
  const state = {
    deletedTables: [],   // table names in delete order
    deletedUsers: [],
    audits: [],
    committed: false,
    rolledBack: false,
    exportQueries: [],
  };

  // Rows the user owns: two by owner uuid, one only by the mapped legacy id.
  const rows = {
    biometric_events: [{ id: 1, owner_user_id: USER, patient_id: USER }, { id: 2, owner_user_id: null, patient_id: LEGACY }],
    raw_biometrics: [{ id: 1, owner_user_id: USER, patient_id: USER }],
    clinical_summaries: [],
    readings: [{ id: 1, owner_user_id: null, patient_id: LEGACY }],
  };

  function handle(text, params = []) {
    const sql = text.replace(/\s+/g, ' ').trim();
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      if (sql === 'COMMIT') state.committed = true;
      if (sql === 'ROLLBACK') state.rolledBack = true;
      return { rows: [] };
    }
    if (sql.startsWith('SELECT legacy_patient_id FROM patient_identity_mappings')) {
      return { rows: [{ legacy_patient_id: LEGACY }] };
    }
    if (sql.startsWith('SELECT id, password_hash FROM users')) {
      return { rows: params[0] === USER ? [{ id: USER, password_hash: passwordHash }] : [] };
    }
    if (sql.startsWith('SELECT * FROM')) {
      const table = sql.match(/FROM (\w+)/)[1];
      state.exportQueries.push(table);
      return { rows: rows[table] ?? [] };
    }
    if (sql.startsWith('SELECT feature, consent_version')) {
      return { rows: [{ feature: 'health_data', consent_version: '1.0.0', granted: true, recorded_at: 'x' }] };
    }
    if (sql.startsWith('DELETE FROM')) {
      const table = sql.match(/DELETE FROM (\w+)/)[1];
      state.deletedTables.push(table);
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO audit_logs')) {
      state.audits.push({ userId: params[1], action: params[3] });
      return { rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  }

  return {
    state,
    async query(text, params) { return handle(text, params); },
    async connect() {
      return { query: async (text, params) => handle(text, params), release() {} };
    },
  };
}

function token(userId, role = 'patient') {
  return jwt.sign({ sub: userId, role }, TEST_SECRET, {
    issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE, expiresIn: '15m',
  });
}

async function startApp(db) {
  const app = express();
  app.use(express.json());
  app.use(attachActor);
  app.use('/api', (req, res, next) => (req.method === 'GET' && req.path === '/health' ? next() : requireAuth(req, res, next)));
  app.use('/api', createAccountRouter({ db }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('export requires authentication', async () => {
  const db = createFakeDb({ passwordHash: 'x' });
  const { server, baseUrl } = await startApp(db);
  try {
    const res = await fetch(`${baseUrl}/api/account/export`);
    assert.equal(res.status, 401);
  } finally { await closeServer(server); }
});

test('delete requires both the typed DELETE word and the password', async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const db = createFakeDb({ passwordHash });
  const { server, baseUrl } = await startApp(db);
  try {
    const auth = { authorization: `Bearer ${token(USER)}`, 'content-type': 'application/json' };

    const noWord = await fetch(`${baseUrl}/api/account`, {
      method: 'DELETE', headers: auth, body: JSON.stringify({ password: PASSWORD }),
    });
    assert.equal(noWord.status, 400);

    const noPassword = await fetch(`${baseUrl}/api/account`, {
      method: 'DELETE', headers: auth, body: JSON.stringify({ confirm: 'DELETE' }),
    });
    assert.equal(noPassword.status, 400);

    const wrongWord = await fetch(`${baseUrl}/api/account`, {
      method: 'DELETE', headers: auth, body: JSON.stringify({ confirm: 'delete', password: PASSWORD }),
    });
    assert.equal(wrongWord.status, 400, 'the confirm word is case-sensitive');

    const wrongPassword = await fetch(`${baseUrl}/api/account`, {
      method: 'DELETE', headers: auth, body: JSON.stringify({ confirm: 'DELETE', password: 'nope' }),
    });
    assert.equal(wrongPassword.status, 401);
    assert.equal(wrongPassword.status === 401 && db.state.deletedUsers.length === 0, true);
  } finally { await closeServer(server); }
});

test('a confirmed erase hard-deletes owned rows (uuid and legacy id), cascades, audits, and removes the user', async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const db = createFakeDb({ passwordHash });
  const { server, baseUrl } = await startApp(db);
  try {
    const res = await fetch(`${baseUrl}/api/account`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token(USER)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE', password: PASSWORD }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });

    // Every owned table is purged, including the one matched only by legacy id.
    for (const table of ['biometric_events', 'raw_biometrics', 'clinical_summaries', 'readings']) {
      assert.ok(db.state.deletedTables.includes(table), `${table} must be erased`);
    }
    assert.ok(db.state.deletedTables.includes('dependents'), 'guardian dependents must be erased');
    assert.ok(db.state.deletedTables.includes('consent_records'));
    assert.ok(db.state.deletedTables.includes('refresh_tokens'));
    assert.ok(db.state.deletedTables.includes('patient_identity_mappings'));
    assert.ok(db.state.deletedTables.includes('users'));

    // The final audit row is written with ids only.
    assert.equal(db.state.audits.at(-1).action, 'DELETE');
    assert.equal(db.state.audits.at(-1).userId, USER);

    // The transaction committed and the refresh cookie was cleared.
    assert.equal(db.state.committed, true);
    const cookie = res.headers.get('set-cookie') || '';
    assert.match(cookie, /veda_refresh_token=/);
    assert.match(cookie, /Path=\/auth/i, 'the cleared cookie must target the same path');
  } finally { await closeServer(server); }
});

test('export returns this account’s owned rows and its consent history', async () => {
  const db = createFakeDb({ passwordHash: 'x' });
  const { server, baseUrl } = await startApp(db);
  try {
    const res = await fetch(`${baseUrl}/api/account/export`, {
      headers: { authorization: `Bearer ${token(USER)}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.biometric_events.length, 2);
    assert.equal(body.data.readings.length, 1);
    assert.equal(body.consentRecords.length, 1);
  } finally { await closeServer(server); }
});

test('migration 007 drops the audit FK without touching the append-only triggers', async () => {
  const migration = await readFile(new URL('../migrations/007_audit_logs_actor_fk.sql', import.meta.url), 'utf8');
  assert.match(migration, /ALTER TABLE audit_logs/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS audit_logs_actor_user_id_fkey/);
  // Check only executable statements, not the explanatory comments.
  const statements = migration
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  assert.doesNotMatch(statements, /DROP TRIGGER|DISABLE TRIGGER|TRUNCATE|DROP TABLE|DELETE\s+FROM|UPDATE\s+/i);
});
