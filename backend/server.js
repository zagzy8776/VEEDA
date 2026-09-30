import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import health from './routes/health.js';
import analyze from './routes/analyze.js';
import biometric from './routes/biometric.js';
import wellness from './routes/wellness.js';
import map from './routes/map.js';
import integrations from './routes/integrations.js';
import fhir from './routes/fhir.js';
import rawBiometrics from './routes/raw-biometrics.js';
import clinician from './routes/clinician.js';
import triage from './routes/triage.js';
import aiChat from './routes/ai-chat.js';
import auth from './routes/auth.js';
import adminDebug from './routes/admin-debug.js';
import { requireAuth } from './security.js';

const app = express();
const PORT = process.env.PORT || 10000;
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  throw new Error('FRONTEND_URL must contain at least one allowed origin in production.');
}

// Browser -> Vercel rewrite -> Render is two proxy hops. A fixed hop count
// resolves the browser address without trusting an arbitrary left-most value.
// The preview diagnostic below must confirm that Vercel/Render overwrite the
// forwarded chain; the per-email limiter remains an independent backstop.
app.set('trust proxy', 2);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
}));
app.use(express.json());

// Authentication endpoints are public so users can establish a session.
app.use('/auth', auth);

app.use('/api', (req, res, next) => {
  if (req.method === 'GET' && req.path === '/health') return next();

  return requireAuth(req, res, next);
});

const aiChatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => `user:${req.user.id}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Too many AI chat requests' }),
});

app.use('/api', health);
app.use('/api', analyze);
app.use('/api', biometric);
app.use('/api', wellness);
app.use('/api', rawBiometrics);
app.use('/api', clinician);
app.use('/api', triage);
app.use('/api/map', map);
app.use('/api/integrations', integrations);
app.use('/api/fhir', fhir);
app.use('/api/ai-chat', aiChatLimiter);
app.use('/api', aiChat);
app.use('/api/admin', adminDebug);

export { app };

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`VEDA backend running on port ${PORT}`));
}
