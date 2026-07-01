import { Router } from 'express';
import sql from '../db.js';
import { audit } from '../security.js';
import { calculateNews2, calculateQsofa } from '../clinical-scoring.js';

const router = Router();

function requireClinician(req, res, next) {
  if (!['nurse', 'attending', 'system_admin', 'admin'].includes(req.actor.role)) {
    audit(req, 'ACCESS_DENIED', req.actor.patientId, { resource: 'clinician_roster' }).catch(() => {});
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

router.get('/clinician/roster', requireClinician, async (req, res) => {
  const tenantId = req.actor.tenantId;
  const wardId = req.actor.role === 'nurse' ? req.actor.wardId : req.query.ward_id || null;
  const { rows } = await sql.query(
    `SELECT DISTINCT ON (patient_id, type)
       patient_id, ward_id, type, value::float AS value, unit, timestamp
     FROM biometric_events
     WHERE tenant_id = $1
       AND ($2::text IS NULL OR ward_id = $2)
       AND timestamp >= NOW() - interval '24 hours'
     ORDER BY patient_id, type, timestamp DESC`,
    [tenantId, wardId],
  );

  const patients = new Map();
  for (const row of rows) {
    if (!patients.has(row.patient_id)) patients.set(row.patient_id, { patientId: row.patient_id, wardId: row.ward_id, latest: {} });
    patients.get(row.patient_id).latest[row.type] = row;
  }

  const roster = Array.from(patients.values()).map(patient => {
    const latest = patient.latest;
    const input = {
      heartRate: latest.heart_rate?.value,
      respiratoryRate: latest.breath_rate?.value,
      oxygenSaturation: latest.oxygen?.value,
      temperature: latest.temperature?.value,
      systolicBp: latest.systolic_bp?.value,
      consciousness: latest.consciousness?.value || 'alert',
    };
    let news2;
    let qsofa;
    try {
      news2 = calculateNews2(input);
      qsofa = calculateQsofa(input);
    } catch {
      news2 = null;
      qsofa = null;
    }
    return {
      ...patient,
      bed: latest.bed?.value || '-',
      news2,
      qsofa,
      priority: news2?.total ?? -1,
    };
  }).sort((a, b) => b.priority - a.priority);

  await audit(req, 'READ', null, { resource: 'clinician_roster', count: roster.length, wardId });
  res.json({ roster });
});

export default router;
