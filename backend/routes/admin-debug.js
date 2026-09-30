import { Router } from 'express';
import { requireRole } from '../security.js';

const router = Router();

// Temporary preview-only diagnostic. Set ENABLE_PROXY_DEBUG=true on Render,
// authenticate as an admin, verify req.ip, then remove/disable before release.
router.get('/proxy-debug', (req, res, next) => {
  if (process.env.ENABLE_PROXY_DEBUG !== 'true') return res.status(404).json({ error: 'Not found' });
  return next();
}, requireRole('admin'), (req, res) => {
  res.json({
    ip: req.ip,
    ips: req.ips,
    socketAddress: req.socket.remoteAddress,
    forwardedFor: req.get('x-forwarded-for') || null,
    vercelId: req.get('x-vercel-id') || null,
    protocol: req.protocol,
    host: req.get('host') || null,
  });
});

export default router;