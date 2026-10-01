import { Router } from 'express';
import sql from '../db.js';
import { audit, requireAuth, requirePatientAccess } from '../security.js';

// Clinician review queue (Phase 7).
//
// A request that needs a human is placed here. The queue enforces:
//   - roles: only a clinician role may work items; a patient may only enqueue and
//     read their own;
//   - an SLA deadline (config, DEFAULT_SLA_MINUTES) that marks an item escalated
//     when it passes;
//   - reviewer sign-off: resolving an item records WHO and WHEN;
//   - an audit trail for every action.
//
// The queue holds NO clinical content: pack id/version are pins, and any wording a
// reviewer sees comes from the reviewed pack, not from this service.

const TENANT_ID = process.env.DEFAULT_TENANT_ID || 'default';
const SLA_MINUTES = Number(process.env.REVIEW_SLA_MINUTES || 60);
const CLINICIAN_ROLES = ['clinician', 'attending', 'nurse', 'system_admin', 'admin'];

function isClinician(user) {
  return Boolean(user && CLINICIAN_ROLES.includes(user.role));
}

export function createReviewQueueRouter({ db = sql } = {}) {
  const router = Router();

  // ── Enqueue a review request (the patient or the system of record) ──
  router.post('/review-queue', requirePatientAccess('CREATE'), async (req, res) => {
    const { kind, dependentId = null, packId = null, packVersion = null, priority = 0 } = req.body || {};
    if (typeof kind !== 'string' || !kind.trim()) {
      return res.status(400).json({ error: 'kind is required' });
    }
    const slaDue = new Date(Date.now() + SLA_MINUTES * 60_000).toISOString();
    try {
      const { rows } = await db.query(
        `INSERT INTO review_queue
           (tenant_id, subject_user_id, dependent_id, kind, pack_id, pack_version, priority, sla_due_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, status, priority, sla_due_at, created_at`,
        [TENANT_ID, req.user.id, dependentId, kind.trim(), packId, packVersion, Number(priority) || 0, slaDue],
      );
      await audit(req, 'CREATE', req.user.id, { resource: 'review_queue', id: rows[0].id, kind });
      return res.status(201).json({ item: rows[0] });
    } catch (error) {
      if (error?.code === '42P01') return res.status(503).json({ error: 'review queue not available' });
      return res.status(500).json({ error: 'Unable to enqueue review at this time' });
    }
  });

  // ── Read the queue (a clinician sees all; a patient sees only their own) ──
  router.get('/review-queue', requireAuth, async (req, res) => {
    try {
      const clinician = isClinician(req.user);
      const { rows } = await db.query(
        `SELECT id, subject_user_id, dependent_id, kind, pack_id, pack_version, priority, status,
                assigned_user_id, sla_due_at, reviewed_by, reviewed_at, review_note, created_at
         FROM review_queue
         WHERE tenant_id = $1 ${clinician ? '' : 'AND subject_user_id = $2'}
         ORDER BY priority DESC, created_at ASC`,
        clinician ? [TENANT_ID] : [TENANT_ID, req.user.id],
      );
      const now = Date.now();
      const items = rows.map(row => ({
        ...row,
        // Escalation is derived: an unresolved item past its SLA is escalated.
        escalated: row.status !== 'resolved' && row.sla_due_at && Date.parse(row.sla_due_at) < now,
      }));
      await audit(req, 'READ', req.user.id, { resource: 'review_queue' });
      return res.json({ items });
    } catch (error) {
      if (error?.code === '42P01') return res.json({ items: [] });
      return res.status(500).json({ error: 'Unable to load review queue at this time' });
    }
  });

  // ── A clinician claims/resolves an item, recording sign-off ──
  router.patch('/review-queue/:id', requireAuth, async (req, res) => {
    if (!isClinician(req.user)) {
      return res.status(403).json({ error: 'A clinician role is required to work the review queue' });
    }
    const { status, note, assignedUserId } = req.body || {};
    const allowed = ['in_review', 'resolved', 'escalated', 'cancelled'];
    if (typeof status !== 'string' || !allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
    }
    const resolved = status === 'resolved';
    try {
      const { rows } = await db.query(
        `UPDATE review_queue
         SET status = $1,
             assigned_user_id = COALESCE($2, assigned_user_id),
             review_note = COALESCE($3, review_note),
             reviewed_by = CASE WHEN $4 THEN $5 ELSE reviewed_by END,
             reviewed_at = CASE WHEN $4 THEN NOW() ELSE reviewed_at END,
             updated_at = NOW()
         WHERE id = $6 AND tenant_id = $7
         RETURNING id, status, assigned_user_id, reviewed_by, reviewed_at`,
        [status, assignedUserId ?? req.user.id, note ?? null, resolved, req.user.id, req.params.id, TENANT_ID],
      );
      if (!rows.length) return res.status(404).json({ error: 'Unknown review item' });
      await audit(req, 'UPDATE', req.user.id, { resource: 'review_queue', id: req.params.id, status });
      return res.json({ item: rows[0] });
    } catch (error) {
      if (error?.code === '42P01') return res.status(503).json({ error: 'review queue not available' });
      return res.status(500).json({ error: 'Unable to update review at this time' });
    }
  });

  return router;
}

export default createReviewQueueRouter();
