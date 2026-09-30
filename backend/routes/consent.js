import { Router } from 'express';
import sql from '../db.js';
import { audit, requirePatientAccess } from '../security.js';
import { CONSENT_UPSERT_SQL, normalizeConsentInput } from '../consent-store.js';

const router = Router();

// POST /api/consent  { feature, version, granted }
// Records or withdraws consent. The client treats localStorage as a cache; this
// endpoint is the durable, auditable record and survives a cleared browser.
router.post('/consent', requirePatientAccess('CREATE'), async (req, res) => {
  const normalized = normalizeConsentInput(req.body);
  if (normalized.ok === false) {
    return res.status(400).json({ error: normalized.error });
  }

  const { feature, consentVersion, granted } = normalized.record;
  try {
    const { rows } = await sql.query(CONSENT_UPSERT_SQL, [
      req.user.id,
      req.actor.tenantId,
      feature,
      consentVersion,
      granted,
    ]);
    await audit(req, 'CREATE', req.user.id, { resource: 'consent_record', feature, granted });
    return res.json({ consent: rows[0] });
  } catch (err) {
    console.error('consent record failed', err.message);
    return res.status(503).json({ error: 'Consent could not be recorded. Please try again.' });
  }
});

// GET /api/consent — current consent state for this user, so a client with a
// cleared localStorage can rehydrate from the server-of-record.
router.get('/consent', requirePatientAccess('READ'), async (req, res) => {
  try {
    const { rows } = await sql.query(
      `SELECT feature, consent_version, granted, recorded_at
       FROM consent_records
       WHERE user_id = $1
       ORDER BY feature, recorded_at DESC`,
      [req.user.id],
    );
    await audit(req, 'READ', req.user.id, { resource: 'consent_records', count: rows.length });
    return res.json({ records: rows });
  } catch (err) {
    console.error('consent read failed', err.message);
    return res.status(503).json({ error: 'Consent could not be read. Please try again.' });
  }
});

export default router;
