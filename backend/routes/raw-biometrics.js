import { Router } from 'express';
import sql from '../db.js';
import { audit, requirePatientAccess } from '../security.js';

const router = Router();
const METRIC_UNITS = {
  HEART_RATE: 'beats/min',
  SPO2: '%',
  RESP_RATE: '/min',
  RR_INTERVAL: 'ms',
};

router.post('/raw-biometrics', requirePatientAccess('CREATE'), async (req, res) => {
  const payload = Array.isArray(req.body) ? req.body : [req.body];
  if (!payload.length) return res.status(400).json({ error: 'payload required' });

  const rows = [];
  for (const item of payload) {
    const metric = item.metric_type || item.metricType;
    if (!METRIC_UNITS[metric]) return res.status(400).json({ error: `unsupported metric_type ${metric}` });
    const unit = item.unit || METRIC_UNITS[metric];
    if (unit !== METRIC_UNITS[metric]) return res.status(400).json({ error: `invalid unit for ${metric}: expected ${METRIC_UNITS[metric]}` });
    const value = Number(item.value);
    if (!Number.isFinite(value)) return res.status(400).json({ error: 'value must be numeric' });
    rows.push({
      patientId: item.patient_id || item.patientId || req.actor.patientId,
      timestamp: item.timestamp || new Date().toISOString(),
      metric,
      value,
      unit,
      metadata: item.metadata || {},
    });
  }

  const client = await sql.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      await client.query(
        `INSERT INTO raw_biometrics (tenant_id, patient_id, timestamp, metric_type, value, unit, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.actor.tenantId, row.patientId, row.timestamp, row.metric, row.value, row.unit, JSON.stringify(row.metadata)],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await audit(req, 'CREATE', rows[0].patientId, { resource: 'raw_biometrics', count: rows.length });
  res.status(202).json({ ok: true, accepted: rows.length });
});

export default router;
