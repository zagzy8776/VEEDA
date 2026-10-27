import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

// Ensure test mode before importing server
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-at-least-32-chars';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';
delete process.env.DATABASE_URL;
delete process.env.CEREBRAS_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.OPENROUTER_API_KEY;

const { app } = await import('../server.js');
const {
  buildVisionMessages,
  getVisionProviders,
  recordVisionProviderFailure,
  recordVisionProviderSuccess,
  visionCapabilityStatus,
  validateVisionImage,
} = await import('../routes/vision.js');

const SECRET = process.env.JWT_SECRET;
function token(id) {
  return jwt.sign(
    { sub: id, role: 'patient' },
    SECRET,
    { issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE, expiresIn: '15m' },
  );
}

async function startServer() {
  const httpServer = http.createServer(app);
  httpServer.unref();
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address();
  return { httpServer, baseUrl: `http://127.0.0.1:${port}` };
}

async function closeServer(httpServer) {
  await new Promise((resolve, reject) => httpServer.close((error) => (error ? reject(error) : resolve())));
}

const { httpServer, baseUrl } = await startServer();
test.after(() => closeServer(httpServer));

test('GET /api/vision/status returns NOT_CONFIGURED when no vision keys are set', async () => {
  const res = await fetch(`${baseUrl}/api/vision/status`, {
    headers: { authorization: `Bearer ${token('v-status')}` },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.visionState, 'NOT_CONFIGURED');
  assert.equal(body.available, false);
  assert.ok(Array.isArray(body.providers));
  assert.equal(body.providers.length, 0);
});

test('provider discovery distinguishes supported and unsupported configured models', () => {
  assert.deepEqual(getVisionProviders({ OPENAI_API_KEY: 'server-only', OPENAI_MODEL: 'text-only-model' }), []);
  const supported = getVisionProviders({ OPENAI_API_KEY: 'server-only', OPENAI_MODEL: 'gpt-4o-mini' });
  assert.equal(supported.length, 1);
  assert.equal(supported[0].name, 'openai');
  assert.equal(supported[0].model, 'gpt-4o-mini');
});

test('server-authoritative capability contract exposes all provider configuration states without keys', () => {
  const supportedEnv = { OPENAI_API_KEY: 'server-only', OPENAI_MODEL: 'gpt-4o-mini' };
  const unsupported = visionCapabilityStatus({ OPENAI_API_KEY: 'server-only', OPENAI_MODEL: 'text-only-model' });
  assert.equal(unsupported.visionState, 'UNSUPPORTED_MODEL');
  assert.equal(unsupported.available, false);
  assert.equal(unsupported.providers[0].name, 'openai');
  assert.equal(unsupported.providers[0].model, 'text-only-model');
  assert.equal(unsupported.providers[0].capabilities.image, false);
  assert.equal(JSON.stringify(unsupported).includes('server-only'), false);

  const available = visionCapabilityStatus(supportedEnv);
  assert.equal(available.visionState, 'AVAILABLE');
  assert.equal(available.available, true);
  const provider = getVisionProviders(supportedEnv)[0];
  recordVisionProviderFailure(provider, 10_000);
  const unavailable = visionCapabilityStatus(supportedEnv, 10_001);
  assert.equal(unavailable.visionState, 'PROVIDER_UNAVAILABLE');
  assert.equal(unavailable.available, false);
  recordVisionProviderSuccess(provider);
});

test('vision provider message keeps exact question, OCR supplement, history, and real image part', () => {
  const question = 'What medicine is this, and what is it used for?';
  const messages = buildVisionMessages({
    image: { data: 'image-base64', mimeType: 'image/jpeg' },
    userQuestion: question,
    ocrText: 'PARACETAMOL 500 mg',
    clinicalBlock: 'CURRENT VITALS:',
    history: [{ role: 'assistant', content: 'Earlier image observation' }],
  });
  const user = messages.at(-1);
  assert.equal(user.role, 'user');
  assert.match(user.content[0].text, new RegExp(`User question: ${question.replace(/[?]/g, '\\?')}`));
  assert.match(user.content[0].text, /OCR supplement[\s\S]*PARACETAMOL 500 mg/);
  assert.deepEqual(user.content[1], {
    type: 'image_url',
    image_url: { url: 'data:image/jpeg;base64,image-base64' },
  });
  assert.deepEqual(messages[1], { role: 'assistant', content: 'Earlier image observation' });
});

test('POST /api/vision/analyze returns 401 without auth', async () => {
  const res = await fetch(`${baseUrl}/api/vision/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: { data: 'abc', mimeType: 'image/jpeg' } }),
  });
  assert.equal(res.status, 401);
});

test('POST /api/vision/analyze returns 400 for missing image', async () => {
  const res = await fetch(`${baseUrl}/api/vision/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token('v1')}` },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
});

test('POST /api/vision/analyze returns 400 for unsupported mime type', async () => {
  const res = await fetch(`${baseUrl}/api/vision/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token('v2')}` },
    body: JSON.stringify({ image: { data: 'abc', mimeType: 'image/svg+xml' } }),
  });
  assert.equal(res.status, 400);
});

test('server image validation rejects malformed base64 and decoded payloads over 10 MB', () => {
  assert.equal(validateVisionImage({ data: 'not base64!', mimeType: 'image/jpeg' }).error, 'Image data must be valid base64');
  const oversized = validateVisionImage({ data: Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64'), mimeType: 'image/png' });
  assert.equal(oversized.ok, false);
  assert.equal(oversized.status, 413);
});

test('POST /api/vision/analyze falls back to OCR/NOT_CONFIGURED when no vision provider configured', async () => {
  const res = await fetch(`${baseUrl}/api/vision/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token('v3')}` },
    body: JSON.stringify({
      image: { data: Buffer.from('fake').toString('base64'), mimeType: 'image/jpeg', ocrText: 'PARACETAMOL 500mg' },
      message: 'What is this?',
    }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.visionState, 'NOT_CONFIGURED');
  assert.equal(body.source, 'ocr');
  // Must not fabricate a visionReply
  assert.equal(body.visionReply, undefined);
});
