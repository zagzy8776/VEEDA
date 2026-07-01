import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import health from './routes/health.js';
import analyze from './routes/analyze.js';
import biometric from './routes/biometric.js';
import wellness from './routes/wellness.js';
import map from './routes/map.js';
import integrations from './routes/integrations.js';
import fhir from './routes/fhir.js';
import rawBiometrics from './routes/raw-biometrics.js';
import clinician from './routes/clinician.js';
import { attachActor } from './security.js';

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());
app.use(attachActor);

// API key guard (skip health check)
app.use((req, res, next) => {
  if (req.path === '/api/health') return next();
  const key = req.headers['x-veda-api-key'];
  if (process.env.VEDA_API_KEY && key !== process.env.VEDA_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
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

app.listen(PORT, () => console.log(`VEDA backend running on port ${PORT}`));
