-- Blood-pressure and blood-glucose readings, synced from the client.
--
-- These are the user's own readings. A row is idempotent per client id: the
-- client assigns a `client_id` and re-sending the same reading upserts rather
-- than duplicating. Blood pressure is a paired systolic/diastolic value, which
-- is why it does not reuse `biometric_events` (single value/unit per row).
--
-- The unit is stored exactly as the client sent it; the server never infers or
-- converts it. `context` is the optional meal tag. `source` is how the reading
-- was captured. No clinical judgement is stored here.
--
-- Idempotent: `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.
CREATE TABLE IF NOT EXISTS readings (
  id              BIGSERIAL PRIMARY KEY,
  owner_user_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id       TEXT        NOT NULL,
  tenant_id       TEXT        NOT NULL DEFAULT 'default',
  kind            TEXT        NOT NULL CHECK (kind IN ('blood_pressure', 'blood_glucose')),
  systolic        INTEGER,
  diastolic       INTEGER,
  value           NUMERIC,
  unit            TEXT,
  context         TEXT        CHECK (context IS NULL OR context IN ('fasting', 'after_meal')),
  source          TEXT        NOT NULL CHECK (source IN ('typed_in', 'device')),
  recorded_at     TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT readings_owner_client_unique UNIQUE (owner_user_id, client_id)
);

CREATE INDEX IF NOT EXISTS readings_owner_recorded_idx
  ON readings (owner_user_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS readings_tenant_idx
  ON readings (tenant_id);
