import { Router } from 'express';
import sql from '../db.js';
import { audit, requirePatientAccess } from '../security.js';
import { validateReadingInput, toRow } from '../readings-validate.js';

// Tenant always comes from server config, never from the request body.
const TENANT_ID = process.env.DEFAULT_TENANT_ID || 'default';

export function createReadingsRouter({ db = sql } = {}) {
  const router = Router();

// ── Sync readings to the server-of-record ──
// The client sends a batch. Each reading is idempotent on (owner, client_id),
// so a retry after a dropped response does not duplicate. Server-side checks
// repeat the client's impossible-value checks; an invalid reading is skipped
// and reported, never stored.
router.post('/readings', requirePatientAccess('CREATE'), async (req, res) => {
  const payload = Array.isArray(req.body) ? req.body : req.body?.readings;
  if (!Array.isArray(payload) || payload.length === 0) {
    return res.status(400).json({ error: 'readings required' });
  }

  const accepted = [];
  const rejected = [];

  for (const input of payload) {
    const check = validateReadingInput(input);
    if (check.ok === false) {
      rejected.push({ clientId: input?.clientId ?? null, error: check.message });
      continue;
    }

    // A dependent must belong to this guardian; the account owner is null.
    let dependentId = null;
    if (input.dependentId != null) {
      try {
        const { rows } = await db.query(
          `SELECT id FROM dependents WHERE id = $1 AND guardian_user_id = $2 LIMIT 1`,
          [input.dependentId, req.user.id],
        );
        if (!rows.length) {
          rejected.push({ clientId: input.clientId, error: 'unknown dependent' });
          continue;
        }
        dependentId = input.dependentId;
      } catch (error) {
        if (error?.code === '42P01') {
          rejected.push({ clientId: input.clientId, error: 'dependents not available' });
          continue;
        }
        throw error;
      }
    }

    const row = toRow(input);
    await db.query(
      `INSERT INTO readings
         (owner_user_id, client_id, tenant_id, dependent_id, kind, systolic, diastolic, value, unit, context, source, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (owner_user_id, client_id)
       DO UPDATE SET
         dependent_id = EXCLUDED.dependent_id,
         kind = EXCLUDED.kind, systolic = EXCLUDED.systolic, diastolic = EXCLUDED.diastolic,
         value = EXCLUDED.value, unit = EXCLUDED.unit, context = EXCLUDED.context,
         source = EXCLUDED.source, recorded_at = EXCLUDED.recorded_at`,
      [
        req.user.id, input.clientId, TENANT_ID, dependentId,
        row.kind, row.systolic, row.diastolic, row.value, row.unit, row.context,
        input.source, input.recordedAt,
      ],
    );
    accepted.push(input.clientId);
  }

  await audit(req, 'CREATE');
  return res.json({ accepted, rejected });
});

// ── Read synced readings back ──
// Returns the account's own readings plus, when asked, one dependant's.
router.get('/readings', requirePatientAccess('READ'), async (req, res) => {
  const dependentId = typeof req.query.dependent_id === 'string' ? req.query.dependent_id : null;
  try {
    if (dependentId) {
      const owned = await db.query(
        `SELECT 1 FROM dependents WHERE id = $1 AND guardian_user_id = $2 LIMIT 1`,
        [dependentId, req.user.id],
      );
      if (!owned.rows.length) return res.status(404).json({ error: 'Unknown dependent' });
    }

    const { rows } = await db.query(
      `SELECT client_id, dependent_id, kind, systolic, diastolic, value, unit, context, source, recorded_at
       FROM readings
       WHERE owner_user_id = $1
         AND dependent_id IS NOT DISTINCT FROM $2::uuid
       ORDER BY recorded_at DESC`,
      [req.user.id, dependentId],
    );
    await audit(req, 'READ');
    return res.json({ readings: rows });
  } catch (error) {
    if (error?.code === '42P01') return res.json({ readings: [] });
    return res.status(500).json({ error: 'Unable to load readings at this time' });
  }
});

// ── Delete this account's synced readings ──
// A separate, explicit action (offered after consent is withdrawn): withdrawing
// consent stops future syncing but does not erase what is already stored.
router.delete('/readings', requirePatientAccess('CREATE'), async (req, res) => {
  try {
    await db.query('DELETE FROM readings WHERE owner_user_id = $1', [req.user.id]);
    await audit(req, 'DELETE');
    return res.json({ ok: true });
  } catch (error) {
    if (error?.code === '42P01') return res.json({ ok: true });
    return res.status(500).json({ error: 'Unable to delete synced readings at this time' });
  }
});

  return router;
}

export default createReadingsRouter;