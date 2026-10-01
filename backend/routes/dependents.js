import { Router } from 'express';
import sql from '../db.js';
import { audit, requirePatientAccess } from '../security.js';

// Tenant always comes from server config, never from the request body.
const TENANT_ID = process.env.DEFAULT_TENANT_ID || 'default';
const MAX_NAME = 80;

function cleanName(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_NAME) : '';
}

// A dependant is managed by exactly one guardian and is never a user. Every
// query is scoped by guardian_user_id, so a guardian can only ever see and
// change their own dependants.
export function createDependentsRouter({ db = sql } = {}) {
  const router = Router();

  router.get('/dependents', requirePatientAccess('READ'), async (req, res) => {
    try {
      const { rows } = await db.query(
        `SELECT id, display_name, age, created_at
         FROM dependents
         WHERE guardian_user_id = $1
         ORDER BY created_at`,
        [req.user.id],
      );
      await audit(req, 'READ');
      return res.json({ dependents: rows });
    } catch (error) {
      if (error?.code === '42P01') return res.json({ dependents: [] });
      return res.status(500).json({ error: 'Unable to load family profiles at this time' });
    }
  });

  router.post('/dependents', requirePatientAccess('CREATE'), async (req, res) => {
    const displayName = cleanName(req.body?.displayName);
    if (!displayName) return res.status(400).json({ error: 'A name is required' });

    let age = null;
    if (req.body?.age != null) {
      const parsed = Number(req.body.age);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 120) {
        return res.status(400).json({ error: 'Age must be between 0 and 120' });
      }
      age = parsed;
    }

    try {
      const { rows } = await db.query(
        `INSERT INTO dependents (guardian_user_id, tenant_id, display_name, age)
         VALUES ($1, $2, $3, $4)
         RETURNING id, display_name, age, created_at`,
        [req.user.id, TENANT_ID, displayName, age],
      );
      await audit(req, 'CREATE');
      return res.status(201).json({ dependent: rows[0] });
    } catch {
      return res.status(500).json({ error: 'Unable to add this family profile at this time' });
    }
  });

  router.delete('/dependents/:dependentId', requirePatientAccess('CREATE'), async (req, res) => {
    try {
      const { rows } = await db.query(
        `DELETE FROM dependents
         WHERE id = $1 AND guardian_user_id = $2
         RETURNING id`,
        [req.params.dependentId, req.user.id],
      );
      if (!rows.length) return res.status(404).json({ error: 'Unknown family profile' });
      await audit(req, 'DELETE');
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: 'Unable to remove this family profile at this time' });
    }
  });

  return router;
}

export default createDependentsRouter;
