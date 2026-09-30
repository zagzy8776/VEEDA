import jwt from 'jsonwebtoken';
import sql from './db.js';

const AUTHORIZED_ROLES = new Set(['patient', 'caregiver', 'clinician', 'admin']);

function getJwtConfig() {
  const secret = process.env.JWT_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('JWT_SECRET must be configured and at least 32 characters long.');
  }

  return {
    secret,
    issuer: process.env.JWT_ISSUER || 'veeda-api',
    audience: process.env.JWT_AUDIENCE || 'veeda-client',
  };
}

function actorFromUser(user) {
  if (!user) {
    return {
      userId: 'anonymous',
      role: null,
      tenantId: process.env.DEFAULT_TENANT_ID || 'default',
      patientId: null,
      wardId: null,
    };
  }

  return {
    userId: user.id,
    role: user.role,
    tenantId: process.env.DEFAULT_TENANT_ID || 'default',
    patientId: user.id,
    wardId: null,
  };
}

export function attachActor(req, _res, next) {
  req.actor = actorFromUser(req.user);
  next();
}

function authenticate(req, res, next, config) {
  const header = req.headers.authorization;
  const match = typeof header === 'string' ? header.match(/^Bearer\s+(.+)$/i) : null;
  if (!match) return res.status(401).json({ error: 'Authentication required' });

  try {
    const { secret, issuer, audience } = config;
    const claims = jwt.verify(match[1], secret, {
      algorithms: ['HS256'],
      issuer,
      audience,
    });

    if (
      typeof claims !== 'object'
      || typeof claims.sub !== 'string'
      || !AUTHORIZED_ROLES.has(claims.role)
      || typeof claims.exp !== 'number'
    ) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    req.user = { id: claims.sub, role: claims.role };
    req.actor = actorFromUser(req.user);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid authentication token' });
  }
}

export function createRequireAuth(config = getJwtConfig()) {
  return (req, res, next) => authenticate(req, res, next, config);
}

export const requireAuth = createRequireAuth();

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    return next();
  };
}

export function canAccessPatient(actor, patientId, action = 'READ') {
  if (!actor?.userId || actor.userId === 'anonymous' || !patientId) return false;
  return String(actor.userId) === String(patientId)
    && ['READ', 'CREATE', 'EXPORT'].includes(action);
}

export const RBAC_MATRIX = {
  patient: { scope: 'self' },
  caregiver: { scope: 'self_until_relationships_exist' },
  clinician: { scope: 'self_until_relationships_exist' },
  admin: { scope: 'self_except_admin_roster' },
};

export function requirePatientAccess(action = 'READ') {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });

    // Body, query, and x-veda-* values are never authorization inputs.
    const requestedPatientId = req.params.patientId || null;
    if (req.user.role === 'admin') {
      req.patientId = requestedPatientId || req.user.id;
      req.wardId = null;
      return next();
    }

    if (requestedPatientId && String(requestedPatientId) !== String(req.user.id)) {
      try {
        const { rows } = await sql.query(
          `SELECT 1
           FROM patient_identity_mappings
           WHERE tenant_id = $1 AND user_id = $2 AND legacy_patient_id = $3
           LIMIT 1`,
          [req.actor.tenantId, req.user.id, requestedPatientId],
        );
        if (!rows.length) {
          await audit(req, 'ACCESS_DENIED');
          return res.status(403).json({ error: 'Forbidden' });
        }
      } catch {
        await audit(req, 'ACCESS_DENIED');
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    if (!canAccessPatient(req.actor, req.user.id, action)) {
      audit(req, 'ACCESS_DENIED').catch(() => {});
      return res.status(403).json({ error: 'Forbidden' });
    }

    req.patientId = req.user.id;
    req.wardId = null;
    return next();
  };
}

export async function audit(req, actionType, patientId = null, _details = {}, db = sql) {
  if (process.env.NODE_ENV === 'test' && db === sql) return;

  try {
    await db.query(
      `INSERT INTO audit_logs (tenant_id, user_id, actor_user_id, patient_id, action_type)
       VALUES ($1, $2, $2, $3, $4)`,
      [
        req.actor?.tenantId || process.env.DEFAULT_TENANT_ID || 'default',
        req.user?.id || req.actor?.userId || 'anonymous',
        patientId || req.user?.id || null,
        actionType,
      ],
    );
  } catch (err) {
    console.error('audit log failed', err.message);
  }
}