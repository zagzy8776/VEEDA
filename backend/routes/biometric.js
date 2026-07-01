import { Router } from 'express';
import sql from '../db.js';
import { audit, requirePatientAccess } from '../security.js';
import { biometricToFhirObservation, canonicalUnit } from '../fhir.js';
const router = Router();

router.post('/biometric-event', requirePatientAccess('CREATE'), async (req, res) => {
  const { type, value, unit, timestamp, metadata = {}, patient_id } = req.body;
  if (!type || value === undefined) return res.status(400).json({ error: 'type and value required' });
  const patientId = patient_id || req.actor.patientId;
  let ucumUnit;
  try {
    ucumUnit = canonicalUnit(type, unit);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const { rows } = await sql.query(
    `INSERT INTO biometric_events (tenant_id, patient_id, user_id, ward_id, type, value, unit, timestamp, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, patient_id, type, value, unit, timestamp`,
    [
      req.actor.tenantId,
      patientId,
      req.actor.userId,
      req.actor.wardId,
      type,
      value,
      ucumUnit,
      timestamp ?? new Date().toISOString(),
      JSON.stringify(metadata),
    ]
  );
  await audit(req, 'CREATE', patientId, { type, eventId: rows[0].id });
  res.json({ ok: true, event: rows[0], fhir: biometricToFhirObservation(rows[0]) });
});

export default router;
