import { Router } from 'express';
import sql from '../db.js';
import { audit } from '../security.js';

const router = Router();

function tenant(req) {
  return req.actor?.tenantId || process.env.DEFAULT_TENANT_ID || 'default';
}

function ownerFilter(req) {
  if (req.user?.id) return { col: 'owner_user_id', val: req.user.id };
  const guestKey = typeof req.headers['x-guest-key'] === 'string' ? req.headers['x-guest-key'].trim() : '';
  if (guestKey) return { col: 'guest_key', val: guestKey };
  return null;
}

/** List conversations for the current user or guest key. */
router.get('/conversations', async (req, res) => {
  const filter = ownerFilter(req);
  if (!filter) return res.status(400).json({ error: 'Sign in or supply X-Guest-Key' });

  try {
    const { rows } = await sql.query(
      `SELECT id, title, status, created_at, updated_at
       FROM conversations
       WHERE tenant_id = $1 AND ${filter.col} = $2
       ORDER BY updated_at DESC
       LIMIT 50`,
      [tenant(req), filter.val],
    );
    return res.json({ conversations: rows });
  } catch (err) {
    console.error('list conversations', err.message);
    return res.status(500).json({ error: 'Failed to list conversations' });
  }
});

/** Create a new conversation. */
router.post('/conversations', async (req, res) => {
  const filter = ownerFilter(req);
  if (!filter) return res.status(400).json({ error: 'Sign in or supply X-Guest-Key' });

  const title = typeof req.body?.title === 'string' && req.body.title.trim()
    ? req.body.title.trim().slice(0, 120)
    : 'New consultation';

  try {
    const ownerCol = filter.col === 'owner_user_id' ? 'owner_user_id' : 'guest_key';
    const { rows } = await sql.query(
      `INSERT INTO conversations (tenant_id, ${ownerCol}, title)
       VALUES ($1, $2, $3)
       RETURNING id, title, status, created_at, updated_at`,
      [tenant(req), filter.val, title],
    );
    if (req.user?.id) await audit(req, 'CREATE', req.user.id);
    return res.status(201).json({ conversation: rows[0] });
  } catch (err) {
    console.error('create conversation', err.message);
    return res.status(500).json({ error: 'Failed to create conversation' });
  }
});

/** Get messages for a conversation (must own it). */
router.get('/conversations/:id/messages', async (req, res) => {
  const filter = ownerFilter(req);
  if (!filter) return res.status(400).json({ error: 'Sign in or supply X-Guest-Key' });

  try {
    const { rows: owned } = await sql.query(
      `SELECT id FROM conversations
       WHERE id = $1 AND tenant_id = $2 AND ${filter.col} = $3
       LIMIT 1`,
      [req.params.id, tenant(req), filter.val],
    );
    if (!owned.length) return res.status(404).json({ error: 'Conversation not found' });

    const { rows } = await sql.query(
      `SELECT id, role, content, metadata, created_at
       FROM conversation_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT 200`,
      [req.params.id],
    );
    return res.json({ messages: rows });
  } catch (err) {
    console.error('get messages', err.message);
    return res.status(500).json({ error: 'Failed to load messages' });
  }
});

/** Append a message (used after AI reply). */
router.post('/conversations/:id/messages', async (req, res) => {
  const filter = ownerFilter(req);
  if (!filter) return res.status(400).json({ error: 'Sign in or supply X-Guest-Key' });

  const role = req.body?.role === 'assistant' ? 'assistant' : 'user';
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (!content) return res.status(400).json({ error: 'content is required' });

  try {
    const { rows: owned } = await sql.query(
      `SELECT id FROM conversations
       WHERE id = $1 AND tenant_id = $2 AND ${filter.col} = $3
       LIMIT 1`,
      [req.params.id, tenant(req), filter.val],
    );
    if (!owned.length) return res.status(404).json({ error: 'Conversation not found' });

    const { rows } = await sql.query(
      `INSERT INTO conversation_messages (conversation_id, role, content, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id, role, content, metadata, created_at`,
      [req.params.id, role, content.slice(0, 8000), req.body?.metadata || {}],
    );

    await sql.query(
      `UPDATE conversations SET updated_at = NOW(),
        title = CASE
          WHEN title = 'New consultation' AND $2 = 'user' THEN LEFT($3, 80)
          ELSE title
        END
       WHERE id = $1`,
      [req.params.id, role, content],
    );

    return res.status(201).json({ message: rows[0] });
  } catch (err) {
    console.error('append message', err.message);
    return res.status(500).json({ error: 'Failed to save message' });
  }
});

/** Archive / close a conversation. */
router.patch('/conversations/:id', async (req, res) => {
  const filter = ownerFilter(req);
  if (!filter) return res.status(400).json({ error: 'Sign in or supply X-Guest-Key' });

  const status = ['active', 'archived', 'closed'].includes(req.body?.status) ? req.body.status : null;
  const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 120) : null;
  if (!status && !title) return res.status(400).json({ error: 'Nothing to update' });

  try {
    const sets = [];
    const params = [req.params.id, tenant(req), filter.val];
    if (status) { params.push(status); sets.push(`status = $${params.length}`); }
    if (title) { params.push(title); sets.push(`title = $${params.length}`); }
    sets.push('updated_at = NOW()');

    const { rows } = await sql.query(
      `UPDATE conversations
       SET ${sets.join(', ')}
       WHERE id = $1 AND tenant_id = $2 AND ${filter.col} = $3
       RETURNING id, title, status, created_at, updated_at`,
      params,
    );
    if (!rows.length) return res.status(404).json({ error: 'Conversation not found' });
    return res.json({ conversation: rows[0] });
  } catch (err) {
    console.error('patch conversation', err.message);
    return res.status(500).json({ error: 'Failed to update conversation' });
  }
});

export default router;
