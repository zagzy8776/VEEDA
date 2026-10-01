-- Allow a user to be hard-deleted when their account is erased.
--
-- 003 added `audit_logs.actor_user_id UUID REFERENCES users(id)` with no delete
-- rule. `audit_logs` is append-only (the prevent_audit_log_mutation trigger
-- blocks UPDATE and DELETE), so the database can neither null those references
-- nor cascade — deleting a user who has any audit row would fail with a foreign
-- key violation. The audit trail must be kept, so we drop the FK and leave the
-- column as a plain UUID holding an id only. The append-only triggers are
-- deliberately NOT touched.
--
-- Idempotent: `DROP CONSTRAINT IF EXISTS` is a no-op when the constraint is gone.
ALTER TABLE audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_actor_user_id_fkey;
