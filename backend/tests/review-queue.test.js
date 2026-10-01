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
process.env.REVIEW_SLA_MINUTES = '30';

const { createReviewQueueRouter } = await import('../routes/review-queue.js');
const { requireAuth, attachActor } = await import('../security.js');

const TEST_SECRET = process.env.JWT_SECRET;
const USER = '11111111-1111-1111-1111-111111111111';

function token(userId = USER, role = 'patient') {
  return jwt.sign({ sub: userId, role }, TEST_SECRET, {
    issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE, expiresIn: '15m',
  });
}

function createQueueDb() {
  const inserted = [];
  const updates = [];
  const rows = [];
  return {
    inserted, updates, rows,
    async query(text, params = []) {
      const sql = text.replace(/\s+/g, ' ').trim();
      if (sql.startsWith('INSERT INTO review_queue')) {
        inserted.push(params);
        const item = { id: `q-${inserted.length}`, status: 'queued', priority: params[6], sla_due_at: params[7], created_at: new Date().toISOString() };
        rows.push(item);
        return { rows: [item] };
      }
      if (sql.startsWith('SELECT id, subject_user_id')) return { rows: rows.map(r => ({ ...r, subject_user_id: USER })) };
      if (sql.startsWith('UPDATE review_queue')) {
        updates.push(params);
        return { rows: [{ id: params[5], status: params[0], assigned_user_id: params[1], reviewed_by: params[3] ? params[4] : null, reviewed_at: params[3] ? 'now' : null }] };
      }
      if (sql.startsWith('INSERT INTO audit_logs')) return { rows: [] };
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
  app.use('/api', createReviewQueueRouter({ db }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('a patient can enqueue a review and it gets an SLA deadline', async () => {
  const db = createQueueDb();
  const { server, baseUrl } = await startApp(db);
  try {
    const res = await fetch(`${baseUrl}/api/review-queue`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'red_flag_referral', packId: 'referral', packVersion: '1.0.0' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.item.status, 'queued');
    assert.ok(body.item.sla_due_at);
    assert.equal(db.inserted.length, 1);
    assert.equal(db.inserted[0][0], 'test-tenant');
  } finally { await closeServer(server); }
});

test('a patient cannot work the queue; only a clinician can', async () => {
  const db = createQueueDb();
  db.rows.push({ id: 'q-1', status: 'queued' });
  const { server, baseUrl } = await startApp(db);
  try {
    const denied = await fetch(`${baseUrl}/api/review-queue/q-1`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token(USER, 'patient')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    });
    assert.equal(denied.status, 403);

    const allowed = await fetch(`${baseUrl}/api/review-queue/q-1`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token(USER, 'clinician')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'resolved', note: 'reviewed' }),
    });
    assert.equal(allowed.status, 200);
    const body = await allowed.json();
    assert.equal(body.item.status, 'resolved');
    assert.equal(body.item.reviewed_by, USER); // reviewer sign-off recorded
  } finally { await closeServer(server); }
});

test('a bad status is refused', async () => {
  const db = createQueueDb();
  const { server, baseUrl } = await startApp(db);
  try {
    const res = await fetch(`${baseUrl}/api/review-queue/q-1`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token(USER, 'clinician')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'nonsense' }),
    });
    assert.equal(res.status, 400);
  } finally { await closeServer(server); }
});

test('migration 010 creates an idempotent review queue with sign-off columns', async () => {
  const migration = await readFile(new URL('../migrations/010_review_queue.sql', import.meta.url), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS review_queue/);
  assert.match(migration, /status\s+TEXT\s+NOT NULL DEFAULT 'queued'/);
  assert.match(migration, /sla_due_at\s+TIMESTAMPTZ/);
  assert.match(migration, /reviewed_by\s+UUID/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS review_queue_status_idx/);
});
