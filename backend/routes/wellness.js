import { Router } from 'express';
import sql from '../db.js';
const router = Router();

router.get('/wellness-history', async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const { rows } = await sql.query(
    `SELECT type, value, unit, timestamp FROM biometric_events WHERE timestamp >= NOW() - ($1 || ' days')::interval ORDER BY timestamp DESC LIMIT 100`,
    [days]
  );
  res.json(rows);
});

router.post('/wellness-event', async (req, res) => {
  const { eventType, message } = req.body;
  if (eventType === 'chat') {
    res.json({ conversationReply: `VEDA heard: "${message}". Stay hydrated and keep monitoring your vitals.` });
  } else {
    res.json({ ok: true });
  }
});

export default router;
