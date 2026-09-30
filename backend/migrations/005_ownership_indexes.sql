CREATE INDEX IF NOT EXISTS idx_biometric_events_owner_timestamp
  ON biometric_events (owner_user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_raw_biometrics_owner_timestamp
  ON raw_biometrics (owner_user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_clinical_summaries_owner_window
  ON clinical_summaries (owner_user_id, window_end DESC);