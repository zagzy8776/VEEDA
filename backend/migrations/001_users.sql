DO $$
BEGIN
  IF to_regprocedure('gen_random_uuid()') IS NULL THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pgcrypto';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'patient'
    CHECK (role IN ('patient', 'caregiver', 'clinician', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
  ON users (LOWER(email));