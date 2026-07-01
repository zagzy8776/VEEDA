import { Router } from 'express';
import sql from '../db.js';
import { audit, requirePatientAccess } from '../security.js';
import {
  biometricToFhirObservation,
  fhirObservationToBiometric,
  patientVitalsBundle,
  buildClinicalBundle,
} from '../fhir.js';

const router = Router();

router.post('/Observation', async (req, res) => {
  let event;
  try {
    event = fhirObservationToBiometric(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  req.body.patient_id = event.patient_id;
  return requirePatientAccess('CREATE')(req, res, async () => {
    const { rows } = await sql.query(
      `INSERT INTO biometric_events (tenant_id, patient_id, user_id, ward_id, type, value, unit, timestamp, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, patient_id, type, value, unit, timestamp`,
      [
        req.actor.tenantId,
        event.patient_id,
        req.actor.userId,
        req.actor.wardId,
        event.type,
        event.value,
        event.unit,
        event.timestamp,
        JSON.stringify(event.metadata),
      ],
    );
    await audit(req, 'CREATE', event.patient_id, { type: event.type, fhir: 'Observation', eventId: rows[0].id });
    return res.status(201).json(biometricToFhirObservation(rows[0]));
  });
});

router.get('/Patient/:patientId/vitals', requirePatientAccess('EXPORT'), async (req, res) => {
  const { rows } = await sql.query(
    `SELECT id, patient_id, type, value, unit, timestamp
     FROM biometric_events
     WHERE tenant_id = $1 AND patient_id = $2
     ORDER BY timestamp DESC
     LIMIT 100`,
    [req.actor.tenantId, req.params.patientId],
  );
  await audit(req, 'EXPORT', req.params.patientId, { fhir: 'Bundle', count: rows.length });
  const observations = rows.map(row => biometricToFhirObservation(row));
  res.json(patientVitalsBundle(req.params.patientId, observations));
});

// ── FHIR Transaction Bundle Export (Patient + Practitioner + Encounter + Observations) ──
router.get('/Patient/:patientId/clinical-bundle', requirePatientAccess('EXPORT'), async (req, res) => {
  const { rows } = await sql.query(
    `SELECT id, patient_id, type, value, unit, timestamp
     FROM biometric_events
     WHERE tenant_id = $1 AND patient_id = $2
     ORDER BY timestamp DESC
     LIMIT 50`,
    [req.actor.tenantId, req.params.patientId],
  );
  await audit(req, 'EXPORT', req.params.patientId, { fhir: 'ClinicalBundle', count: rows.length });

  // Profile stored in localStorage on frontend; for now we extract from query or actor
  const profile = req.query.profile ? JSON.parse(req.query.profile) : { name: req.params.patientId };

  const result = buildClinicalBundle({
    patientId: req.params.patientId,
    profile,
    userId: req.actor.userId,
    role: req.actor.role,
    wardId: req.actor.wardId,
    observations: rows,
  });

  res.json(result.bundle);
});

// ── Practitioner resource lookup ──────────────────────────────────────────────
router.get('/Practitioner/:practitionerId', (req, res) => {
  // In production, look up from a providers table. For now, return a minimal resource.
  res.json({
    resourceType: 'Practitioner',
    id: req.params.practitionerId,
    identifier: [{
      system: 'https://veeda.local/fhir/identifiers',
      value: req.params.practitionerId,
    }],
    name: [{
      use: 'official',
      family: req.params.practitionerId,
      given: ['Clinician'],
    }],
    meta: { source: 'VEEDA' },
  });
});

export default router;
