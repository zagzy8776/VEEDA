-- Server-side consent record.
--
-- localStorage is only a cache; this table is the durable, auditable record of
-- what a user consented to, when, and whether it is currently withdrawn. One
-- row per (user, feature, version) so the history of consent changes is kept
-- rather than overwritten.
CREATE TABLE IF NOT EXISTS consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT consent_records_user_feature_version_unique
    UNIQUE (user_id, feature, consent_version)
);

CREATE INDEX IF NOT EXISTS consent_records_user_idx
  ON consent_records (user_id, feature);
