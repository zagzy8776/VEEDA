import { Router } from 'express';
import sql from '../db.js';
import { audit, requirePatientAccess } from '../security.js';
import { biometricToFhirObservation } from '../fhir.js';
import { clinicalChatReply, getBiometricContext } from '../clinical-context.js';
const router = Router();
const EMERGENCY_NUMBER = process.env.EMERGENCY_NUMBER || '112';

router.get('/wellness-history', requirePatientAccess('READ'), async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const patientId = req.query.patient_id || req.actor.patientId;
  const wardId = req.actor.role === 'nurse' ? req.actor.wardId : req.query.ward_id;
  const tenantId = req.actor.tenantId;
  const format = String(req.query.format || '').toLowerCase();
  const { rows } = await sql.query(
    `SELECT id, patient_id, type, value, unit, timestamp
     FROM biometric_events
     WHERE timestamp >= NOW() - ($1 || ' days')::interval
       AND ($2::text IS NULL OR patient_id = $2)
       AND ($3::text IS NULL OR ward_id = $3)
       AND tenant_id = $4
     ORDER BY timestamp DESC
     LIMIT 100`,
    [days, patientId, wardId, tenantId]
  );
  await audit(req, format === 'fhir' ? 'EXPORT' : 'READ', patientId, { days, wardId, format: format || 'json' });
  if (format === 'fhir') {
    return res.json({
      resourceType: 'Bundle',
      type: 'searchset',
      total: rows.length,
      entry: rows.map(row => ({ resource: biometricToFhirObservation(row) })),
    });
  }
  res.json(rows);
});

router.post('/wellness-event', async (req, res) => {
  const { eventType, message, vitals, analysis, wellnessScore, profile } = req.body;
  if (eventType !== 'chat') return res.json({ ok: true });

  const patientId = req.body.patient_id || req.actor.patientId;
  const context = await getBiometricContext({ tenantId: req.actor.tenantId, patientId, hours: 24 });
  const reply = clinicalChatReply({ message, vitals, analysis, context });
  await audit(req, 'READ', patientId, { resource: 'clinical_chat', contextAvailable: context.available });

  res.json({ conversationReply: reply, biometricContext: context.promptBlock });
});

export default router;
