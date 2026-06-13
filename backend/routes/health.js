import { Router } from 'express';
const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'online', ts: new Date().toISOString() });
});

export default router;
