import { Pool } from '@neondatabase/serverless';

/**
 * The database pool, created LAZILY on first use.
 *
 * The Neon serverless `Pool` keeps a socket handle alive from the moment it is
 * constructed. Constructing it at import time means merely importing this module
 * (directly, or transitively through a route) leaves the Node event loop alive,
 * so a test process that never runs a query — or deliberately runs without a
 * `DATABASE_URL` — would hang instead of exiting. Opening the pool on first
 * `query`/`connect` fixes that: nothing is opened until a query is actually
 * issued, and a process that issues none exits cleanly.
 *
 * The exported object is a thin proxy with the same shape callers already use
 * (`db.query(...)`, `db.connect()`), so no call site changes.
 */
let pool = null;

/**
 * Build (once) the Neon `Pool`. If there is no `DATABASE_URL` at all we refuse
 * to construct one: a Pool pointed at `undefined` would not fail fast — a query
 * would sit trying to open a connection, which hangs a test process (or a
 * misconfigured server) instead of surfacing a clear error. Throwing here turns
 * "no database configured" into an immediate, catchable failure that routes
 * already handle (their `try/catch` returns an empty list or a 500, never a hang).
 */
function getPool() {
  if (pool === null) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not configured');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

const db = {
  // These are `async` so a missing DATABASE_URL surfaces as a REJECTED promise
  // the caller's `await ... catch` handles — exactly as a real connection error
  // would. Throwing synchronously instead would escape the `await` and, in an
  // Express async middleware, leave the request hanging with no response.
  async query(...args) {
    return getPool().query(...args);
  },
  async connect(...args) {
    return getPool().connect(...args);
  },
  async end(...args) {
    if (pool === null) return;
    return pool.end(...args);
  },
  /** Test seam: drop the lazily-created pool so a fresh one is made next use. */
  reset() {
    pool = null;
  },
};

export default db;
