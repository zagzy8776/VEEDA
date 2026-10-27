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
import consent from './routes/consent.js';
import aiChat from './routes/ai-chat.js';
import conversations from './routes/conversations.js';
import vision from './routes/vision.js';
import authModule from './routes/auth.js';
import account from './routes/account.js';
import readings from './routes/readings.js';
import dependents from './routes/dependents.js';
import alerts from './routes/alerts.js';
import reviewQueue from './routes/review-queue.js';
import adminDebug from './routes/admin-debug.js';
import medicine from './routes/medicine.js';
import { requireAuth } from './security.js';

function resolveAuthRouter(mod) {
  try {
    if (mod && Array.isArray(mod.stack)) return mod;
    if (typeof mod === 'function') {
      if (typeof mod.handle === 'function' && Array.isArray(mod.stack)) return mod;
      const out = mod();
      if (out && (Array.isArray(out.stack) || typeof out.handle === 'function')) return out;
    }
  } catch (err) {
    console.error('Failed to resolve auth router:', err);
  }
  throw new Error('auth.js must export an Express router or a factory that returns one');
}
const auth = resolveAuthRouter(authModule);
console.log('Auth router mounted with', (auth.stack || []).length, 'layers');

const app = express();
const PORT = process.env.PORT || 10000;
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  throw new Error('FRONTEND_URL must contain at least one allowed origin in production.');
}

if (process.env.NODE_ENV === 'production' && !process.env.EMERGENCY_NUMBER) {
  console.warn(
    '\n' + '='.repeat(72) +
    '\n  WARNING: EMERGENCY_NUMBER is not set in production.' +
    '\n  Set EMERGENCY_NUMBER on Render before go-live.' +
    '\n' + '='.repeat(72) + '\n',
  );
}

app.set('trust proxy', 2);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
}));
app.use('/api/vision', requireAuth, express.json({ limit: '15mb' }), vision);
app.use(express.json());

// Lightweight probe — if this hangs, the whole /auth mount is broken
app.get('/auth/ping', (_req, res) => res.json({ ok: true, service: 'auth' }));
app.use('/auth', auth);

function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  const asGuest = () => {
    req.user = null;
    req.actor = {
      userId: 'guest',
      role: null,
      tenantId: process.env.DEFAULT_TENANT_ID || 'default',
      patientId: null,
      wardId: null,
    };
    return next();
  };
  if (!header) return asGuest();
  const fakeRes = {
    status(code) { this._code = code; return this; },
    json() { return asGuest(); },
  };
  return requireAuth(req, fakeRes, (err) => {
    if (err) return asGuest();
    if (!req.user) return asGuest();
    return next();
  });
}

app.use('/api', (req, res, next) => {
  if (req.method === 'GET' && req.path === '/health') return next();
  if (req.path === '/ai-chat' || req.path.startsWith('/ai-chat/')) return next();
  if (req.path === '/conversations' || req.path.startsWith('/conversations/')) return next();
  return requireAuth(req, res, next);
});

const aiChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.AI_CHAT_RATE_LIMIT_PER_MIN || 30),
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`),
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
app.use('/api', consent);
app.use('/api', account);
app.use('/api', readings);
app.use('/api', dependents);
app.use('/api', alerts);
app.use('/api', reviewQueue);
app.use('/api/map', map);
app.use('/api/integrations', integrations);
app.use('/api/fhir', fhir);
app.use('/api/ai-chat', optionalAuth, aiChatLimiter, aiChat);
app.use('/api', optionalAuth, conversations);
app.use('/api', medicine);
app.use('/api/admin', adminDebug);

export { app };

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`VEDA backend running on port ${PORT}`));
}
