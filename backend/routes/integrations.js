import { Router } from 'express';
const router = Router();

router.get('/fitbit/status', (req, res) => {
  res.json({
    configured: !!process.env.FITBIT_CLIENT_ID,
    connected: false,
    message: process.env.FITBIT_CLIENT_ID
      ? 'Fitbit credentials configured. Connect your account.'
      : 'Fitbit not configured. Add FITBIT_CLIENT_ID and FITBIT_CLIENT_SECRET to environment.',
    metrics: {},
  });
});

router.get('/fitbit/connect', (req, res) => {
  const clientId = process.env.FITBIT_CLIENT_ID;
  if (!clientId) return res.status(503).send('Fitbit not configured');
  const redirect = encodeURIComponent(`${process.env.BACKEND_URL}/api/integrations/fitbit/callback`);
  res.redirect(`https://www.fitbit.com/oauth2/authorize?response_type=code&client_id=${clientId}&scope=heartrate+activity+sleep+oxygen_saturation+temperature&redirect_uri=${redirect}`);
});

router.get('/fitbit/callback', (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL || '/'}#/profile?fitbit=connected`);
});

router.post('/fitbit/sync', (req, res) => {
  res.json({ ok: false, message: 'Fitbit sync not yet configured.' });
});

export default router;
