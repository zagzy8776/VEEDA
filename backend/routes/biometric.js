import { Router } from 'express';
import sql from '../db.js';
const router = Router();

router.post('/biometric-event', async (req, res) => {
  const { type, value, unit, timestamp, metadata = {} } = req.body;
  if (!type || value === undefined) return res.status(400).json({ error: 'type and value required' });

  await sql.query(
    'INSERT INTO biometric_events (type, value, unit, timestamp, metadata) VALUES ($1, $2, $3, $4, $5)',
    [type, value, unit, timestamp ?? new Date().toISOString(), JSON.stringify(metadata)]
  );
  res.json({ ok: true });
});

export default router;
