# Database migrations

Apply these **in order, one at a time**, against a database that already has the
base schema (`biometric_events`, `raw_biometrics`, `clinical_summaries`,
`audit_logs`). Always run them first on a **Neon backup branch** before touching
the primary branch.

| # | File | What it changes | Safe to run twice? |
|---|------|-----------------|--------------------|
| 001 | `001_users.sql` | Enables `pgcrypto` (guarded), then creates the `users` table (id UUID PK, email, password_hash, role, created/updated timestamps) and a unique lower-cased email index. | **Yes.** `CREATE TABLE IF NOT EXISTS` and `CREATE UNIQUE INDEX IF NOT EXISTS`; the extension is only created when `gen_random_uuid()` is missing. |
| 002 | `002_refresh_tokens.sql` | Creates the `refresh_tokens` table (hashed token, expiry, `revoked_at`, FK to `users` on delete cascade) plus a user index and a partial active-token index. | **Yes.** All statements are `CREATE ... IF NOT EXISTS`. |
| 003 | `003_ownership_columns.sql` | Adds a nullable `owner_user_id` UUID FK to `biometric_events`, `raw_biometrics`, `clinical_summaries`, and `actor_user_id` to `audit_logs`. | **Yes.** Uses `ADD COLUMN IF NOT EXISTS`. |
| 004 | `004_patient_identity_mappings.sql` | Creates `patient_identity_mappings` (user ↔ tenant ↔ legacy_patient_id) with two uniqueness constraints. | **Yes.** `CREATE TABLE IF NOT EXISTS`. |
| 005 | `005_ownership_indexes.sql` | Adds owner/timestamp indexes on `biometric_events`, `raw_biometrics`, and `clinical_summaries` for per-user history queries. | **Yes.** `CREATE INDEX IF NOT EXISTS`. |
| 006 | `006_consent_records.sql` | Creates the `consent_records` table: one row per `(user_id, feature, consent_version)` holding `granted`, `recorded_at`, and `tenant_id`, plus a lookup index. This is the durable, auditable consent record (localStorage is only a cache). | **Yes.** `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. |
| 007 | `007_audit_logs_actor_fk.sql` | Drops the foreign key `audit_logs.actor_user_id → users(id)` (added in 003) and leaves the column as a plain UUID. `audit_logs` is append-only, so the DB could not null or cascade that reference and a user with any audit row could not be deleted. The append-only triggers are **not** touched; the audit trail is kept, holding ids only. | **Yes.** `DROP CONSTRAINT IF EXISTS` is a no-op once the constraint is gone. |
| 008 | `008_readings.sql` | Creates the `readings` table for synced blood-pressure/glucose readings: `owner_user_id` (FK to `users`, delete cascade), `client_id`, `kind`, the paired `systolic`/`diastolic` or `value`/`unit`, optional `context`, `source`, `recorded_at`, and a `UNIQUE (owner_user_id, client_id)` so re-sending a reading upserts instead of duplicating. Adds owner/timestamp and tenant indexes. | **Yes.** `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. |
| 009 | `009_dependents.sql` | Creates `dependents` (a family profile managed by one guardian: `guardian_user_id` FK to `users` delete cascade, `display_name`, optional `age`; **no** email/password/user link — a dependant is never a user) and adds `readings.dependent_id` as a nullable FK to `dependents` (NULL = the account owner). Adds guardian and dependent indexes. | **Yes.** `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, and `CREATE INDEX IF NOT EXISTS`; the FK is added inside a `pg_constraint`-guarded `DO` block. |

## Notes

- Every migration is **idempotent**, so re-running the whole set is safe and is a
  reasonable way to bring a branch up to date.
- 003 and 005 assume the base tables exist. If they do not, apply 001 first and
  create the base schema before continuing.
- Nothing here is destructive to health data: no table, column, or index holding
  readings is dropped or renamed. 007 drops a single foreign-key constraint (not
  the column and not any data) so an account erase can remove the user row; the
  audit rows remain.
