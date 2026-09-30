import { Router } from 'express';
import sql from '../db.js';
import { audit, requirePatientAccess } from '../security.js';
import { biometricToFhirObservation } from '../fhir.js';
import { clinicalChatReply, getBiometricContext } from '../clinical-context.js';
import { ownershipPredicate, resolveLegacyPatientId } from '../ownership.js';
const router = Router();
const EMERGENCY_NUMBER = process.env.EMERGENCY_NUMBER || '112';

router.get('/wellness-history', requirePatientAccess('READ'), async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const patientId = await resolveLegacyPatientId({
    db: sql,
    tenantId: req.actor.tenantId,
    userId: req.user.id,
  });
  const wardId = null;
  const tenantId = req.actor.tenantId;
  const format = String(req.query.format || '').toLowerCase();
  const { rows } = await sql.query(
    `SELECT be.id, be.patient_id, be.type, be.value, be.unit, be.timestamp
     FROM biometric_events be
     WHERE timestamp >= NOW() - ($1 || ' days')::interval
       AND ($3::text IS NULL OR be.ward_id = $3)
       AND be.tenant_id = $4
       AND ${req.user.role === 'admin' ? 'TRUE' : ownershipPredicate({ tableAlias: 'be', userParam: '$2', tenantParam: '$4' })}
     ORDER BY timestamp DESC
     LIMIT 100`,
    [days, req.user.id, wardId, tenantId]
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
  const { eventType, message, vitals, analysis } = req.body;
  if (eventType !== 'chat') return res.json({ ok: true });

  const patientId = req.user.id;
  const context = await getBiometricContext({ tenantId: req.actor.tenantId, patientId, userId: req.user.id, hours: 24 });
  const reply = clinicalChatReply({ message, vitals, analysis, context });
  await audit(req, 'READ', patientId, { resource: 'clinical_chat', contextAvailable: context.available });

  res.json({ conversationReply: reply, biometricContext: context.promptBlock });
});

export default router;
