ALTER TABLE biometric_events
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id);

ALTER TABLE raw_biometrics
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id);

ALTER TABLE clinical_summaries
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id);

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES users(id);