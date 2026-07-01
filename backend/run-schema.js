import { Pool } from '@neondatabase/serverless';

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_7oOPiX4bdgqf@ep-fancy-queen-a2gams03-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
});

const statements = [
  `CREATE TABLE IF NOT EXISTS biometric_events (
    id         BIGSERIAL PRIMARY KEY,
    type       TEXT        NOT NULL,
    value      NUMERIC     NOT NULL,
    unit       TEXT,
    timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata   JSONB       DEFAULT '{}'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_biometric_events_timestamp ON biometric_events (timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_biometric_events_type ON biometric_events (type)`,
];

for (const stmt of statements) {
  await pool.query(stmt);
  console.log('✓', stmt.trim().split('\n')[0]);
}

await pool.end();
console.log('\nSchema applied to Neon successfully.');
