# Database migrations

## Running them

```bash
npm run migrate     # applies the base schema, then 001..011 in order
```

`npm run migrate` is **self-sufficient**: it first creates the base tables the
numbered migrations `ALTER` (`biometric_events`, `raw_biometrics`,
`clinical_summaries`, `audit_logs`), then applies every migration and records it
in `schema_migrations`. It is safe on an empty database and idempotent on a
populated one.

`npm run setup` (`run-schema.js`) is the older, separate provisioning path. It
creates the same base tables plus the append-only audit triggers, and records
itself as `000_base_schema.sql`. It is only needed if you want the triggers
without running migrations. It **must not** be relied on to create `users`,
`refresh_tokens`, `readings`, `dependents`, or `review_queue` — those belong to
migrations `001`, `002`, `008`, `009`, and `010`, which own their own DDL.

> **Why this matters.** Migrations `003`, `005`, `007`, and `009` `ALTER` tables
> they do not create. If the base tables are missing, the run aborts partway; and
> because each migration commits its `schema_migrations` row in the *same*
> transaction as its DDL, a rollback leaves the earlier tables created but
> *unrecorded*, so every retry restarts and fails at the same place. This is the
> exact failure that produced a permanent HTTP 500 on `POST /auth/register`.

Apply these **in order, one at a time**, against a database that already has the
base schema. Always run them first on a **Neon backup branch** before touching
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
| 010 | `010_review_queue.sql` | Creates the `review_queue` table for the clinician review queue: `subject_user_id` (FK to `users`, delete cascade), optional `dependent_id`, `kind`, `pack_id`/`pack_version` pins, `priority`, `status` (with a CHECK constraint), `assigned_user_id`, `sla_due_at`, reviewer sign-off (`reviewed_by`/`reviewed_at`/`review_note`), and timestamps. Adds status and subject indexes. Holds no clinical content. | **Yes.** `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. |
| 011 | `011_dependents_birth_year.sql` | Replaces the frozen `dependents.age` with a stored `birth_year` (and optional `birth_month`) so the server computes a dependant's age **at request time** — a dependant then keeps crossing the adult cutoff as they grow up instead of being frozen at capture. Adds `age_confirmed` (default false) and `age_confirmed_at`; the age gate trusts a birth year only while confirmed and within the configured re-confirm interval. Backfills `birth_year` approximately from the old `age` + `created_at` and marks those rows unconfirmed, then drops `age`. | **Yes.** `ADD COLUMN IF NOT EXISTS`, a guarded backfill, and `DROP COLUMN IF EXISTS`. |

## Notes

- Every migration is **idempotent**, so re-running the whole set is safe and is a
  reasonable way to bring a branch up to date.
- 003 and 005 assume the base tables exist. If they do not, apply 001 first and
  create the base schema before continuing.
- Nothing here is destructive to health data: no table, column, or index holding
  readings is dropped or renamed. 007 drops a single foreign-key constraint (not
  the column and not any data) so an account erase can remove the user row; the
  audit rows remain. 011 drops `dependents.age` **after** backfilling it into
  `birth_year`, so no dependant record loses its age information.
