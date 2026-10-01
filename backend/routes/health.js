import { Router } from 'express';
import sql from '../db.js';
const router = Router();

router.get('/health', async (req, res) => {
  let dbStatus = 'unknown';
  let schemaStatus = 'unknown';
  try {
    // `SELECT 1` only proves a TCP connection. It succeeds on a database where the
    // application tables were never created — which is exactly how an un-migrated
    // database reported `db: connected` while every register/login request 500'd.
    // Probe the table auth actually writes to, and the migration ledger, so health
    // can tell "reachable but not provisioned" apart from "ready".
    const { rows } = await sql.query('SELECT 1 AS ok');
    dbStatus = rows?.[0]?.ok === 1 ? 'connected' : 'error';

    const { rows: schemaRows } = await sql.query(
      `SELECT
         to_regclass('public.users') IS NOT NULL AS has_users,
         to_regclass('public.schema_migrations') IS NOT NULL AS has_migrations`,
    );
    const { has_users: hasUsers, has_migrations: hasMigrations } = schemaRows?.[0] ?? {};
    schemaStatus = hasUsers ? 'ready' : hasMigrations ? 'incomplete' : 'unprovisioned';
  } catch {
    dbStatus = 'disconnected';
    schemaStatus = 'unknown';
  }
  res.json({ status: 'online', db: dbStatus, schema: schemaStatus, ts: new Date().toISOString() });
});

export default router;
