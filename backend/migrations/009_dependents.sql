-- Family profiles (dependants). A dependant is a person a signed-in guardian
-- manages from their own account. A dependant is NEVER a user and is never
-- linked to another account: there is no email, no password, and no user_id —
-- only `guardian_user_id`. Switching to a dependant only scopes which readings
-- are shown/saved; it never changes who is signed in.
--
-- `dependent_id` is added to `readings` as a nullable FK: NULL means the
-- reading belongs to the account owner; a value means it belongs to that
-- dependant of the account owner. This keeps the shape simple and safe.
--
-- A dependant's age is optional. If it is unknown, or below the adult cutoff the
-- deployment configures, the app must NOT compute or show adult-only scores
-- (NEWS2, qSOFA) or adult BP interpretation for them.
--
-- Idempotent: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
-- `CREATE INDEX IF NOT EXISTS`. The FK is added inside a DO block guarded so a
-- re-run does not error.
CREATE TABLE IF NOT EXISTS dependents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id         TEXT NOT NULL DEFAULT 'default',
  display_name      TEXT NOT NULL,
  age               INTEGER CHECK (age IS NULL OR (age >= 0 AND age <= 120)),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dependents_guardian_idx
  ON dependents (guardian_user_id, created_at);

ALTER TABLE readings
  ADD COLUMN IF NOT EXISTS dependent_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'readings_dependent_id_fkey'
  ) THEN
    ALTER TABLE readings
      ADD CONSTRAINT readings_dependent_id_fkey
      FOREIGN KEY (dependent_id) REFERENCES dependents(id) ON DELETE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS readings_dependent_idx
  ON readings (dependent_id, recorded_at DESC);
