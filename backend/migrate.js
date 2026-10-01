import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from '@neondatabase/serverless';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, 'migrations');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be configured before running migrations.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Base tables that the numbered migrations `ALTER` but never `CREATE`.
 *
 * 003 and 005 alter `biometric_events`, `raw_biometrics` and `clinical_summaries`;
 * 007 alters `audit_logs`; 009 alters `readings` (created by 008, which runs
 * first, so `readings` is NOT in this list). On a fresh database these tables do
 * not exist, so 003 aborted the run, its transaction rolled back, and 001/002
 * were never recorded — a permanently "half-migrated" database that every retry
 * reproduced. Creating them here, as the migration runner's own prerequisite,
 * makes the chain runnable on an empty database and keeps the two scripts from
 * drifting apart again.
 *
 * Every statement is `IF NOT EXISTS`, so this is a no-op on a database that was
 * already provisioned by `npm run setup` (run-schema.js).
 */
const BASE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS biometric_events (
    id         BIGSERIAL PRIMARY KEY,
    tenant_id  TEXT        NOT NULL DEFAULT 'default',
    patient_id TEXT,
    user_id    TEXT,
    ward_id    TEXT,
    type       TEXT        NOT NULL,
    value      NUMERIC     NOT NULL,
    unit       TEXT,
    timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata   JSONB       DEFAULT '{}'
  )`,
  `ALTER TABLE biometric_events ADD COLUMN IF NOT EXISTS patient_id TEXT`,
  `ALTER TABLE biometric_events ADD COLUMN IF NOT EXISTS user_id TEXT`,
  `ALTER TABLE biometric_events ADD COLUMN IF NOT EXISTS ward_id TEXT`,
  `ALTER TABLE biometric_events ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default'`,
  `CREATE INDEX IF NOT EXISTS idx_biometric_events_timestamp ON biometric_events (timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_biometric_events_type ON biometric_events (type)`,
  `CREATE INDEX IF NOT EXISTS idx_biometric_events_patient_timestamp ON biometric_events (patient_id, timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_biometric_events_tenant_patient_timestamp ON biometric_events (tenant_id, patient_id, timestamp DESC)`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   TEXT        NOT NULL DEFAULT 'default',
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id     TEXT        NOT NULL,
    patient_id  TEXT,
    action_type TEXT        NOT NULL CHECK (action_type IN ('CREATE', 'READ', 'UPDATE', 'EXPORT', 'DELETE', 'LOGIN', 'ACCESS_DENIED')),
    ip_address  TEXT,
    user_agent  TEXT,
    route       TEXT,
    details     JSONB       DEFAULT '{}'
  )`,
  `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default'`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_patient_timestamp ON audit_logs (patient_id, timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp ON audit_logs (user_id, timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_timestamp ON audit_logs (tenant_id, timestamp DESC)`,
  `CREATE TABLE IF NOT EXISTS raw_biometrics (
    tenant_id   TEXT        NOT NULL,
    patient_id  TEXT        NOT NULL,
    timestamp   TIMESTAMPTZ NOT NULL,
    metric_type TEXT        NOT NULL CHECK (metric_type IN ('HEART_RATE', 'SPO2', 'RESP_RATE', 'RR_INTERVAL')),
    value       NUMERIC     NOT NULL,
    unit        TEXT        NOT NULL,
    source      TEXT        DEFAULT 'phone',
    metadata    JSONB       DEFAULT '{}',
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_raw_biometrics_patient_metric_time
   ON raw_biometrics (tenant_id, patient_id, metric_type, timestamp DESC)`,
  `CREATE TABLE IF NOT EXISTS clinical_summaries (
    tenant_id    TEXT        NOT NULL,
    patient_id   TEXT        NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    window_end   TIMESTAMPTZ NOT NULL,
    summary      JSONB       NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, patient_id, window_start, window_end)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_clinical_summaries_patient_window
   ON clinical_summaries (tenant_id, patient_id, window_end DESC)`,
];

for (const statement of BASE_SCHEMA_STATEMENTS) {
  await pool.query(statement);
}
console.log('Base schema prerequisite ensured (biometric_events, audit_logs, raw_biometrics, clinical_summaries).');

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await readdir(migrationsDir))
    .filter((filename) => /^\d+_[^/]+\.sql$/.test(filename))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (const filename of files) {
    const { rows } = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [filename],
    );

    if (rows.length > 0) {
      console.log(`Skipping ${filename} (already applied)`);
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, filename), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [filename],
      );
      await client.query('COMMIT');
      console.log(`Applied ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}