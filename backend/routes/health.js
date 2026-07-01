import { Router } from 'express';
import sql from '../db.js';
const router = Router();

router.get('/health', async (req, res) => {
  let dbStatus = 'unknown';
  try {
    const { rows } = await sql.query('SELECT 1 AS ok');
    dbStatus = rows?.[0]?.ok === 1 ? 'connected' : 'error';
  } catch {
    dbStatus = 'disconnected';
  }
  res.json({ status: 'online', db: dbStatus, ts: new Date().toISOString() });
});

export default router;
