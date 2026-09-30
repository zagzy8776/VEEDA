CREATE TABLE IF NOT EXISTS patient_identity_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  legacy_patient_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patient_identity_mappings_tenant_legacy_unique
    UNIQUE (tenant_id, legacy_patient_id),
  CONSTRAINT patient_identity_mappings_tenant_user_unique
    UNIQUE (tenant_id, user_id)
);