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
import aiChat from './routes/ai-chat.js';
import auth from './routes/auth.js';
import { requireAuth } from './security.js';

const app = express();
const PORT = process.env.PORT || 10000;
const legacyApiKeyEnabled = process.env.LEGACY_API_KEY_ENABLED === 'true';
const configuredApiKey = process.env.VEDA_API_KEY;

if (legacyApiKeyEnabled && !configuredApiKey) {
  throw new Error('VEDA_API_KEY must be configured when LEGACY_API_KEY_ENABLED=true.');
}

app.set('trust proxy', 1);
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// Authentication endpoints are public so users can establish a session.
app.use('/auth', auth);

app.use('/api', (req, res, next) => {
  if (req.method === 'GET' && req.path === '/health') return next();

  if (legacyApiKeyEnabled && req.headers['x-veda-api-key']) {
    console.warn('Legacy API key request rejected as anonymous; JWT authentication is required.');
    return res.status(401).json({ error: 'Authentication required' });
  }

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
app.use('/api/map', map);
app.use('/api/integrations', integrations);
app.use('/api/fhir', fhir);
app.use('/api/ai-chat', aiChatLimiter);
app.use('/api', aiChat);

export { app };

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`VEDA backend running on port ${PORT}`));
}
