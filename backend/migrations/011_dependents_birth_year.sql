-- Replace a dependant's stored AGE with a stored BIRTH YEAR (and optional
-- birth month), so the server can work out how old the dependant is *now*.
--
-- Why: an age typed in once goes stale. A dependant entered as 15 stays "15"
-- forever and never crosses the adult cutoff — the unsafe direction for a gate,
-- because the app would keep treating an adult as a child. Conversely a mis-typed
-- age never self-corrects. Storing the birth year and computing the age at
-- request time fixes both: the age is always current.
--
-- Confirmation: a birth year can itself be wrong or a guess. `age_confirmed`
-- records whether a human has confirmed it, and `age_confirmed_at` when. The
-- server treats an age as KNOWN only while it is confirmed and not older than
-- the configured re-confirm interval; otherwise the dependant is UNKNOWN age and
-- gets no adult-only scores.
--
-- `birth_month` is optional. When present the computed age honours the birthday
-- (a dependant whose birthday has not yet come round this year is one younger);
-- when absent the server is conservative and assumes the birthday has passed.
--
-- Backfill: existing rows only hold `age`. We approximate `birth_year` as
-- (year the row was created) minus (the recorded age) and mark it
-- `age_confirmed = false`, because that value is a derivation, not a confirmed
-- fact. Those rows will be treated as unknown age until a carer confirms them.
--
-- Idempotent: `ADD COLUMN IF NOT EXISTS`, a guarded `UPDATE`, and
-- `DROP COLUMN IF EXISTS`. Re-running is a no-op.
ALTER TABLE dependents
  ADD COLUMN IF NOT EXISTS birth_year INTEGER
    CHECK (birth_year IS NULL OR (birth_year >= 1900 AND birth_year <= 2200));

ALTER TABLE dependents
  ADD COLUMN IF NOT EXISTS birth_month INTEGER
    CHECK (birth_month IS NULL OR (birth_month >= 1 AND birth_month <= 12));

ALTER TABLE dependents
  ADD COLUMN IF NOT EXISTS age_confirmed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE dependents
  ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ;

-- Approximate backfill from the legacy `age` column, only for rows that still
-- have an age and no birth year yet. The value is marked UNCONFIRMED.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dependents' AND column_name = 'age'
  ) THEN
    EXECUTE $sql$
      UPDATE dependents
         SET birth_year = EXTRACT(YEAR FROM created_at)::int - age,
             age_confirmed = false,
             age_confirmed_at = NULL
       WHERE age IS NOT NULL AND birth_year IS NULL
    $sql$;
  END IF;
END
$$;

-- The legacy `age` column is no longer read anywhere: the server computes the
-- age from `birth_year` at request time.
ALTER TABLE dependents
  DROP COLUMN IF EXISTS age;
