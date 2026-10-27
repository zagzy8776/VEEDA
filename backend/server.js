import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import health from './routes/health.js';
import analyze from './routes/analyze.js';
import biometric from './routes/biometric.js';
import wellness from './routes/wellness.js';
import map from './routes/map.js';
import rawBiometrics from './routes/raw-biometrics.js';
import clinician from './routes/clinician.js';
import triage from './routes/triage.js';
import vision from './routes/vision.js';
import medicine from './routes/medicine.js';
import foodScan from './routes/food-scan.js';
import modelsStatus from './routes/models-status.js';
import aiChat from './routes/ai-chat.js';
import conversations from './routes/conversations.js';
import auth from './routes/auth.js';
import consent from './routes/consent.js';
import account from './routes/account.js';
import readings from './routes/readings.js';
import dependents from './routes/dependents.js';
import alerts from './routes/alerts.js';
import { requireAuth } from './security.js';
import { listMountedRoutes } from './route-inventory.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

const aiChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI chat requests. Please wait a moment.' },
});

app.use('/api/vision', requireAuth, express.json({ limit: '15mb' }), vision);
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
  // Soft-auth: never 401 the public chat route — bad/expired tokens fall back to guest
  const fakeRes = {
    status(code) {
      this._code = code;
      return this;
    },
    json() {
      return asGuest();
    },
  };
  return requireAuth(req, fakeRes, (err) => {
    if (err) return asGuest();
    if (!req.user) return asGuest();
    return next();
  });
}

// Public (optional auth) clinical surfaces
app.use('/api/ai-chat', optionalAuth, aiChatLimiter, aiChat);
app.use('/api', optionalAuth, conversations);

app.use('/api', (req, res, next) => {
  if (req.method === 'GET' && req.path === '/health') return next();
  if (req.path === '/ai-chat' || req.path.startsWith('/ai-chat/')) return next();
  if (req.path === '/conversations' || req.path.startsWith('/conversations/')) return next();
  return requireAuth(req, res, next);
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
app.use('/api', map);
app.use('/api', medicine);
app.use('/api', foodScan);
app.use('/api', modelsStatus);

if (process.env.NODE_ENV !== 'test') {
  const inventory = listMountedRoutes(app);
  console.log(`\nVEDA backend route inventory (${inventory.length} mounted groups):\n${inventory.join('\n')}\n`);
}

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`VEDA backend running on port ${PORT}`));
}

export default app;
