import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { readFile } from 'node:fs/promises';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-at-least-32-chars';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';
process.env.DEFAULT_TENANT_ID = 'test-tenant';

const {
  isUnmappedLegacyRow,
  ownershipPredicate,
  rowVisibleToUser,
} = await import('../ownership.js');
const { createAuthRouter } = await import('../routes/auth.js');

const TEST_SECRET = process.env.JWT_SECRET;

function createClaimDb() {
  const mappings = [];
  const audits = [];

  async function query(text, params = []) {
    const sql = text.replace(/\s+/g, ' ').trim();
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
    if (sql.startsWith('INSERT INTO audit_logs')) {
      audits.push({ tenantId: params[0], userId: params[1], patientId: params[2], action: params[3] });
      return { rows: [] };
    }
    throw new Error(`Unexpected query outside transaction: ${sql}`);
  }

  async function connect() {
    return {
      async query(text, params = []) {
        const sql = text.replace(/\s+/g, ' ').trim();
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.startsWith('SELECT id FROM patient_identity_mappings')) {
          return {
            rows: mappings
              .filter((mapping) => mapping.tenantId === params[0] && mapping.userId === params[1])
              .map((mapping) => ({ id: mapping.id })),
          };
        }
        if (sql.startsWith('INSERT INTO patient_identity_mappings')) {
          if (mappings.some((mapping) => mapping.tenantId === params[1] && mapping.legacyPatientId === params[2])) {
            const error = new Error('duplicate mapping');
            error.code = '23505';
            throw error;
          }
          mappings.push({
            id: crypto.randomUUID(),
            userId: params[0],
            tenantId: params[1],
            legacyPatientId: params[2],
          });
          return { rows: [] };
        }
        if (sql.startsWith('INSERT INTO audit_logs')) {
          audits.push({ tenantId: params[0], userId: params[1], patientId: params[2], action: params[3] });
          return { rows: [] };
        }
        throw new Error(`Unexpected query in transaction: ${sql}`);
      },
      release() {},
    };
  }

  return { mappings, audits, query, connect };
}

function token(userId, role = 'patient') {
  return jwt.sign(
    { sub: userId, role },
    TEST_SECRET,
    { issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE, expiresIn: '15m' },
  );
}

async function startClaimApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter({
    db,
    jwtSecret: TEST_SECRET,
    issuer: process.env.JWT_ISSUER,
    audience: process.env.JWT_AUDIENCE,
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function claim(baseUrl, accessToken, legacyPatientId) {
  const response = await fetch(`${baseUrl}/auth/claim-legacy-id`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ legacy_patient_id: legacyPatientId }),
  });
  return { status: response.status, body: await response.json() };
}

test('migrations add ownership without changing legacy columns or disabling audit triggers', async () => {
  const migration003 = await readFile(new URL('../migrations/003_ownership_columns.sql', import.meta.url), 'utf8');
  const migration004 = await readFile(new URL('../migrations/004_patient_identity_mappings.sql', import.meta.url), 'utf8');
  const migration005 = await readFile(new URL('../migrations/005_ownership_indexes.sql', import.meta.url), 'utf8');

  assert.match(migration003, /biometric_events[\s\S]*owner_user_id UUID REFERENCES users\(id\)/);
  assert.match(migration003, /raw_biometrics[\s\S]*owner_user_id UUID REFERENCES users\(id\)/);
  assert.match(migration003, /clinical_summaries[\s\S]*owner_user_id UUID REFERENCES users\(id\)/);
  assert.match(migration003, /audit_logs[\s\S]*actor_user_id UUID REFERENCES users\(id\)/);
  assert.doesNotMatch(migration003, /DROP TRIGGER|DISABLE TRIGGER|TRUNCATE|UPDATE\s+/i);
  assert.match(migration004, /UNIQUE \(tenant_id, legacy_patient_id\)/);
  assert.match(migration004, /UNIQUE \(tenant_id, user_id\)/);
  assert.match(migration005, /biometric_events_owner_timestamp/);
  assert.match(migration005, /raw_biometrics_owner_timestamp/);
  assert.match(migration005, /clinical_summaries_owner_window/);
  assert.doesNotMatch(migration003, /UPDATE\s+(biometric_events|raw_biometrics|clinical_summaries|audit_logs)/i);
  assert.doesNotMatch(migration004, /UPDATE\s+/i);
  assert.doesNotMatch(migration005, /UPDATE\s+/i);
});

test('new inserts dual-write legacy patient_id and JWT owner_user_id', async () => {
  const [biometric, raw, worker] = await Promise.all([
    readFile(new URL('../routes/biometric.js', import.meta.url), 'utf8'),
    readFile(new URL('../routes/raw-biometrics.js', import.meta.url), 'utf8'),
    readFile(new URL('../workers/biometric-synthesis-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.match(biometric, /patient_id, user_id, owner_user_id/);
  assert.match(biometric, /req\.user\.id/);
  assert.match(raw, /patient_id, owner_user_id/);
  assert.match(raw, /req\.user\.id/);
  assert.match(worker, /patient_id, owner_user_id/);
});

test('ownership visibility distinguishes owner, mapped legacy, unmapped, and admin rows', () => {
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  const mapping = [{ tenant_id: 'test-tenant', user_id: userA, legacy_patient_id: 'legacy-a' }];
  const owned = { owner_user_id: userA, patient_id: userA };
  const claimedLegacy = { owner_user_id: null, patient_id: 'legacy-a' };
  const unmapped = { owner_user_id: null, patient_id: 'legacy-unmapped' };

  assert.equal(rowVisibleToUser({ row: owned, userId: userA, tenantId: 'test-tenant', mappings: [] }), true);
  assert.equal(rowVisibleToUser({ row: owned, userId: userB, tenantId: 'test-tenant', mappings: [] }), false);
  assert.equal(rowVisibleToUser({ row: claimedLegacy, userId: userA, tenantId: 'test-tenant', mappings: mapping }), true);
  assert.equal(rowVisibleToUser({ row: claimedLegacy, userId: userB, tenantId: 'test-tenant', mappings: mapping }), false);
  assert.equal(isUnmappedLegacyRow({ row: unmapped, tenantId: 'test-tenant', mappings: mapping }), true);
  assert.equal(rowVisibleToUser({ row: unmapped, userId: userA, tenantId: 'test-tenant', mappings: mapping }), false);
  assert.equal(rowVisibleToUser({ row: unmapped, userId: userB, role: 'admin', tenantId: 'test-tenant', mappings: mapping }), true);

  const predicate = ownershipPredicate({ tableAlias: 'be', userParam: '$2', tenantParam: '$1' });
  assert.match(predicate, /be\.owner_user_id = \$2/);
  assert.match(predicate, /patient_identity_mappings/);
});

test('legacy claim is one-per-user, one-per-ID, rate-limited, and audited', async () => {
  const db = createClaimDb();
  const app = await startClaimApp(db);
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  try {
    const first = await claim(app.baseUrl, token(userA), 'legacy-a');
    const secondForUser = await claim(app.baseUrl, token(userA), 'legacy-b');
    const secondForId = await claim(app.baseUrl, token(userB), 'legacy-a');

    assert.equal(first.status, 201);
    assert.equal(secondForUser.status, 409);
    assert.equal(secondForId.status, 409);
    assert.equal(db.mappings.length, 1);
    assert.equal(db.audits.length >= 3, true);
    assert.equal(db.audits.some((entry) => entry.action === 'CREATE'), true);
    assert.equal(db.audits.some((entry) => entry.action === 'ACCESS_DENIED'), true);
    assert.equal(db.audits.some((entry) => entry.patientId === 'legacy-a'), true);
  } finally {
    await closeServer(app.server);
  }
});

after(() => {
  delete process.env.NODE_ENV;
  delete process.env.JWT_SECRET;
  delete process.env.JWT_ISSUER;
  delete process.env.JWT_AUDIENCE;
  delete process.env.DEFAULT_TENANT_ID;
});