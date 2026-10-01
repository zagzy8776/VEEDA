import test from 'node:test';
import assert from 'node:assert/strict';

// The database module must NOT open a connection merely when it is imported, and
// must not construct a Neon `Pool` while there is nothing to talk to. If it did,
// every test process that imports a route (which imports db.js) would hold a
// socket handle open and hang instead of exiting. This suite pins the lazy
// behaviour: no DATABASE_URL, no query issued, and the process still exits.
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

const db = (await import('../db.js')).default;

test('importing db.js opens nothing: the module exports a lazy proxy', () => {
  // The shape callers rely on is present…
  assert.equal(typeof db.query, 'function');
  assert.equal(typeof db.connect, 'function');
  assert.equal(typeof db.end, 'function');
  // …but it is a thin wrapper, not a live Pool instance.
  assert.equal(db.constructor?.name, 'Object');
  assert.equal(typeof db.totalCount, 'undefined', 'an unopened pool exposes no counters');
});

test('end() with nothing opened resolves instead of touching a pool', async () => {
  await assert.doesNotReject(() => db.end());
});
