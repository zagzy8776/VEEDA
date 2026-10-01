import { Router } from 'express';
import sql from '../db.js';
import { audit, requirePatientAccess } from '../security.js';
import { ageFromBirthYear } from '../age-gate.js';

// Tenant always comes from server config, never from the request body.
const TENANT_ID = process.env.DEFAULT_TENANT_ID || 'default';
const MAX_NAME = 80;
const MIN_BIRTH_YEAR = 1900;
const MAX_BIRTH_YEAR = 2200;

function cleanName(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_NAME) : '';
}

// The stored birth year is what makes an age stay correct over time; the row is
// returned with a derived `age` so the client can display it without doing its
// own date maths (the age gate itself always runs on the server).
function toPublicDependent(row) {
  return {
    id: row.id,
    display_name: row.display_name,
    birth_year: row.birth_year ?? null,
    birth_month: row.birth_month ?? null,
    age_confirmed: row.age_confirmed === true,
    age_confirmed_at: row.age_confirmed_at ?? null,
    age: ageFromBirthYear(row.birth_year, row.birth_month),
    created_at: row.created_at,
  };
}

// A dependant is managed by exactly one guardian and is never a user. Every
// query is scoped by guardian_user_id, so a guardian can only ever see and
// change their own dependants.
export function createDependentsRouter({ db = sql } = {}) {
  const router = Router();

  router.get('/dependents', requirePatientAccess('READ'), async (req, res) => {
    try {
      const { rows } = await db.query(
        `SELECT id, display_name, birth_year, birth_month, age_confirmed, age_confirmed_at, created_at
         FROM dependents
         WHERE guardian_user_id = $1
         ORDER BY created_at`,
        [req.user.id],
      );
      await audit(req, 'READ');
      return res.json({ dependents: rows.map(toPublicDependent) });
    } catch (error) {
      if (error?.code === '42P01') return res.json({ dependents: [] });
      return res.status(500).json({ error: 'Unable to load family profiles at this time' });
    }
  });

  router.post('/dependents', requirePatientAccess('CREATE'), async (req, res) => {
    const displayName = cleanName(req.body?.displayName);
    if (!displayName) return res.status(400).json({ error: 'A name is required' });

    // Prefer a birth year; fall back to an age only to DERIVE one, so the stored
    // value never goes stale. Anything out of range is refused.
    let birthYear = null;
    let birthMonth = null;

    if (req.body?.birthYear != null) {
      const parsed = Number(req.body.birthYear);
      if (!Number.isInteger(parsed) || parsed < MIN_BIRTH_YEAR || parsed > MAX_BIRTH_YEAR) {
        return res.status(400).json({ error: `Birth year must be between ${MIN_BIRTH_YEAR} and ${MAX_BIRTH_YEAR}` });
      }
      birthYear = parsed;
    } else if (req.body?.age != null) {
      const parsed = Number(req.body.age);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 120) {
        return res.status(400).json({ error: 'Age must be between 0 and 120' });
      }
      birthYear = new Date().getFullYear() - parsed;
    }

    if (req.body?.birthMonth != null) {
      const parsed = Number(req.body.birthMonth);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
        return res.status(400).json({ error: 'Birth month must be between 1 and 12' });
      }
      birthMonth = parsed;
    }

    try {
      // A dependant added or edited by a carer is a CONFIRMED age: stamp it so
      // the gate trusts it until the configured re-confirm interval elapses.
      const { rows } = await db.query(
        `INSERT INTO dependents
           (guardian_user_id, tenant_id, display_name, birth_year, birth_month, age_confirmed, age_confirmed_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING id, display_name, birth_year, birth_month, age_confirmed, age_confirmed_at, created_at`,
        [req.user.id, TENANT_ID, displayName, birthYear, birthMonth, birthYear != null],
      );
      await audit(req, 'CREATE');
      return res.status(201).json({ dependent: toPublicDependent(rows[0]) });
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

export default createDependentsRouter();
