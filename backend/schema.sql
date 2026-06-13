CREATE TABLE IF NOT EXISTS biometric_events (
  id         BIGSERIAL PRIMARY KEY,
  type       TEXT        NOT NULL,
  value      NUMERIC     NOT NULL,
  unit       TEXT,
  timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata   JSONB       DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_biometric_events_timestamp ON biometric_events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_biometric_events_type ON biometric_events (type);
