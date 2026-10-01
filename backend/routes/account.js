import { Router } from 'express';
import bcrypt from 'bcrypt';
import sql from '../db.js';
import { audit } from '../security.js';
import { legacyPatientIdsForUser } from '../ownership.js';

// Same cookie attributes as the auth router's refresh cookie (path '/auth'),
// so clearing it here actually removes the cookie the browser stored.
const REFRESH_COOKIE_NAME = 'veda_refresh_token';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/auth',
};

// The user must retype this exact word (case-sensitive) to confirm an erase.
const DELETE_CONFIRM_WORD = 'DELETE';

// Every table that holds this user's health data. Rows are matched by the owner
// UUID OR by any legacy patient_id mapped to the user, because older rows were
// written before ownership columns existed and may never have been back-filled.
// `readings` and `dependents` are added by later migrations; a missing table is
// skipped rather than failing the whole erase.
const OWNED_TABLES = [
  { table: 'biometric_events', ownerColumn: 'owner_user_id', legacyColumn: 'patient_id' },
  { table: 'raw_biometrics', ownerColumn: 'owner_user_id', legacyColumn: 'patient_id' },
  { table: 'clinical_summaries', ownerColumn: 'owner_user_id', legacyColumn: 'patient_id' },
  { table: 'readings', ownerColumn: 'owner_user_id', legacyColumn: 'patient_id' },
];

export const ACCOUNT_EXPORT_TABLES = OWNED_TABLES;

function unauthorized(res) {
  return res.status(401).json({ error: 'Authentication required' });
}

export function createAccountRouter({ db = sql } = {}) {
  const router = Router();

  // ── Export: everything this account owns, as a portable JSON document ──
  router.get('/account/export', async (req, res) => {
    if (!req.user) return unauthorized(res);
    const tenantId = req.actor?.tenantId;
    const userId = req.user.id;

    try {
      const legacyIds = await legacyPatientIdsForUser({ db, tenantId, userId });
      const data = {};

      for (const { table, ownerColumn, legacyColumn } of OWNED_TABLES) {
        try {
          const { rows } = await db.query(
            `SELECT * FROM ${table}
             WHERE ${ownerColumn} = $1
                OR (${ownerColumn} IS NULL AND ${legacyColumn} = ANY($2::text[]))`,
            [userId, legacyIds],
          );
          data[table] = rows;
        } catch (error) {
          // A table that does not exist yet (pre-migration) exports as empty.
          if (error?.code === '42P01') { data[table] = []; continue; }
          throw error;
        }
      }

      const { rows: consent } = await db.query(
        `SELECT feature, consent_version, granted, recorded_at
         FROM consent_records
         WHERE user_id = $1
         ORDER BY feature, consent_version`,
        [userId],
      );

      await audit(req, 'EXPORT');

      return res.json({
        generatedAt: new Date().toISOString(),
        user: { id: userId, email: req.user.email ?? null, role: req.user.role ?? null },
        consentRecords: consent,
        data,
      });
    } catch {
      return res.status(500).json({ error: 'Unable to export account data at this time' });
    }
  });

  // ── Delete: hard-erase this account and its owned data ──
  //
  // Requires the password AND the typed word DELETE. No grace period. Runs in a
  // single transaction; the audit row is written inside it with ids only (the FK
  // on actor_user_id was dropped in 007 so the user row can be removed).
  router.delete('/account', async (req, res) => {
    if (!req.user) return unauthorized(res);
    const tenantId = req.actor?.tenantId;
    const userId = req.user.id;
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const confirm = typeof req.body?.confirm === 'string' ? req.body.confirm : '';

    if (confirm !== DELETE_CONFIRM_WORD) {
      return res.status(400).json({ error: `Type ${DELETE_CONFIRM_WORD} to confirm` });
    }
    if (!password) return res.status(400).json({ error: 'Password is required' });

    const client = await db.connect();
    try {
      const { rows } = await client.query(
        'SELECT id, password_hash FROM users WHERE id = $1 LIMIT 1',
        [userId],
      );
      const user = rows[0];
      // Compare even when the user is gone so a timing signal does not leak
      // whether the id exists.
      const hash = user?.password_hash || '$2b$12$/9N/M2csHR2USUaYUe.RXeBFCWGtePpgOcwMq9O1s9Dy2UO3ic4gO';
      const matches = await bcrypt.compare(password, hash);
      if (!user || !matches) {
        return res.status(401).json({ error: 'Password is incorrect' });
      }

      const legacyIds = await legacyPatientIdsForUser({ db: client, tenantId, userId });

      await client.query('BEGIN');

      // Dependants are keyed only by guardian_user_id.
      try {
        await client.query('DELETE FROM dependents WHERE guardian_user_id = $1', [userId]);
      } catch (error) {
        if (error?.code !== '42P01') throw error;
      }

      for (const { table, ownerColumn, legacyColumn } of OWNED_TABLES) {
        try {
          await client.query(
            `DELETE FROM ${table}
             WHERE ${ownerColumn} = $1
                OR (${ownerColumn} IS NULL AND ${legacyColumn} = ANY($2::text[]))`,
            [userId, legacyIds],
          );
        } catch (error) {
          if (error?.code !== '42P01') throw error;
        }
      }

      // Identity links and consent rows cascade on the users delete, but delete
      // them explicitly so the intent is visible and not dependent on cascade.
      await client.query('DELETE FROM consent_records WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM patient_identity_mappings WHERE user_id = $1', [userId]);

      // Final audit row: ids only. audit_logs is append-only, so this insert
      // stands and the row cannot be changed or removed later.
      await audit(req, 'DELETE', null, {}, client);

      await client.query('DELETE FROM users WHERE id = $1', [userId]);

      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Unable to delete the account at this time' });
    } finally {
      client.release();
    }

    res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
    return res.json({ ok: true });
  });

  return router;
}

export default createAccountRouter;
