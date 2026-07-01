CREATE TABLE IF NOT EXISTS biometric_events (
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
);

ALTER TABLE biometric_events ADD COLUMN IF NOT EXISTS patient_id TEXT;
ALTER TABLE biometric_events ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE biometric_events ADD COLUMN IF NOT EXISTS ward_id TEXT;
ALTER TABLE biometric_events ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_biometric_events_timestamp ON biometric_events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_biometric_events_type ON biometric_events (type);
CREATE INDEX IF NOT EXISTS idx_biometric_events_patient_timestamp ON biometric_events (patient_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_biometric_events_tenant_patient_timestamp ON biometric_events (tenant_id, patient_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
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
);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_patient_timestamp ON audit_logs (patient_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp ON audit_logs (user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_timestamp ON audit_logs (tenant_id, timestamp DESC);

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS timescaledb;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'TimescaleDB extension unavailable; raw_biometrics will use standard PostgreSQL indexes.';
END $$;

CREATE TABLE IF NOT EXISTS raw_biometrics (
  tenant_id   TEXT        NOT NULL,
  patient_id  TEXT        NOT NULL,
  timestamp   TIMESTAMPTZ NOT NULL,
  metric_type TEXT        NOT NULL CHECK (metric_type IN ('HEART_RATE', 'SPO2', 'RESP_RATE', 'RR_INTERVAL')),
  value       NUMERIC     NOT NULL,
  unit        TEXT        NOT NULL,
  source      TEXT        DEFAULT 'phone',
  metadata    JSONB       DEFAULT '{}',
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_biometrics_patient_metric_time
  ON raw_biometrics (tenant_id, patient_id, metric_type, timestamp DESC);

DO $$
BEGIN
  PERFORM create_hypertable('raw_biometrics', 'timestamp', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'raw_biometrics hypertable not created; continuing with btree indexes.';
END $$;

CREATE TABLE IF NOT EXISTS clinical_summaries (
  tenant_id    TEXT        NOT NULL,
  patient_id   TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end   TIMESTAMPTZ NOT NULL,
  summary      JSONB       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, patient_id, window_start, window_end)
);

CREATE INDEX IF NOT EXISTS idx_clinical_summaries_patient_window
  ON clinical_summaries (tenant_id, patient_id, window_end DESC);

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
CREATE TRIGGER audit_logs_no_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

DROP TRIGGER IF EXISTS audit_logs_no_delete ON audit_logs;
CREATE TRIGGER audit_logs_no_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
