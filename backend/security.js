import sql from './db.js';

export function attachActor(req, _res, next) {
  req.actor = {
    userId: req.headers['x-veda-user-id'] || 'anonymous',
    role: req.headers['x-veda-role'] || 'patient',
    tenantId: req.headers['x-veda-tenant-id'] || 'default',
    patientId: req.headers['x-veda-patient-id'] || req.headers['x-veda-user-id'] || 'anonymous',
    wardId: req.headers['x-veda-ward-id'] || null,
  };
  next();
}

export function canAccessPatient(actor, patientId, action = 'READ', wardId = null) {
  if (!patientId) return true;
  if (actor.role === 'system_admin' || actor.role === 'admin' || actor.role === 'attending') return true;
  if (actor.role === 'nurse') return Boolean(actor.wardId && (!wardId || String(actor.wardId) === String(wardId)));
  if (actor.role === 'patient') return action === 'READ' && String(actor.patientId) === String(patientId);
  return false;
}

export const RBAC_MATRIX = {
  system_admin: {
    biometric_events: ['READ'],
    audit_logs: ['READ', 'EXPORT'],
    configuration: ['READ', 'UPDATE'],
    scope: 'tenant',
  },
  attending: {
    biometric_events: ['READ', 'CREATE', 'EXPORT'],
    clinical_scores: ['READ'],
    audit_logs: ['READ'],
    scope: 'tenant',
  },
  nurse: {
    biometric_events: ['READ', 'CREATE'],
    clinical_scores: ['READ'],
    audit_logs: [],
    scope: 'assigned_ward',
  },
  patient: {
    biometric_events: ['READ'],
    clinical_scores: ['READ'],
    audit_logs: [],
    scope: 'self',
  },
};

export function requirePatientAccess(action = 'READ') {
  return (req, res, next) => {
    const patientId = req.params.patientId || req.query.patient_id || req.body.patient_id || req.actor?.patientId;
    const wardId = req.params.wardId || req.query.ward_id || req.body.ward_id || req.actor?.wardId;
    if (!canAccessPatient(req.actor, patientId, action, wardId)) {
      audit(req, 'ACCESS_DENIED', patientId, { action, wardId }).catch(() => {});
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.patientId = patientId;
    req.wardId = wardId;
    next();
  };
}

export async function audit(req, actionType, patientId, details = {}) {
  try {
    await sql.query(
      `INSERT INTO audit_logs (tenant_id, user_id, patient_id, action_type, ip_address, user_agent, route, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        req.actor?.tenantId || 'default',
        req.actor?.userId || 'anonymous',
        patientId || req.actor?.patientId || null,
        actionType,
        req.ip,
        req.headers['user-agent'] || null,
        req.originalUrl,
        JSON.stringify(details),
      ],
    );
  } catch (err) {
    console.error('audit log failed', err);
  }
}
