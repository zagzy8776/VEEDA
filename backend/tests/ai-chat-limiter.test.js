import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

// Pins the AI chat rate limit exactly as server.js configures it:
// 30 requests per 15-minute window, keyed per user id (NOT per IP), 429 with
// { error: 'Too many AI chat requests' } on the 31st. The provider keys are
// deleted before importing server.js so every reply comes from the rule-based
// fallback — the test never calls Cerebras/Groq and never needs a database
// (audit() is a no-op under NODE_ENV=test, the DB context call fails closed).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-at-least-32-chars';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';
delete process.env.DATABASE_URL;
delete process.env.CEREBRAS_API_KEY;
delete process.env.GROQ_API_KEY;

const { app } = await import('../server.js');

const SECRET = process.env.JWT_SECRET;
const CHAT_LIMIT = 30;

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

async function postChat(baseUrl, authToken) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`${baseUrl}/api/ai-chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ message: 'rate limit probe' }),
      signal: controller.signal,
    });
    return { status: response.status, rateLimitHeader: response.headers.get('ratelimit'), body: await response.json() };
  } finally {
    clearTimeout(timer);
  }
}

const { httpServer, baseUrl } = await startServer();
after(() => closeServer(httpServer));

test(`the ${CHAT_LIMIT}th chat request inside the window is rate limited with 429`, async () => {
  const authToken = token('rate-limit-patient-1');
  let lastGood = null;
  for (let i = 1; i <= CHAT_LIMIT; i += 1) {
    lastGood = await postChat(baseUrl, authToken);
    assert.ok(
      lastGood.status >= 200 && lastGood.status < 300,
      `request ${i}/${CHAT_LIMIT} should have been answered before the limit, got ${lastGood.status}`,
    );
    assert.ok(lastGood.body?.conversationReply, `request ${i} should carry a reply even without provider keys`);
  }

  const blocked = await postChat(baseUrl, authToken);
  assert.equal(blocked.status, 429, 'the request right after the limit must be 429');
  assert.equal(blocked.body?.error, 'Too many AI chat requests');
  // express-rate-limit draft-8 emits the quota as `"30-in-15min"; r=0; t=900`.
  assert.ok(
    typeof blocked.rateLimitHeader === 'string' && blocked.rateLimitHeader.includes('30-in-15min') && blocked.rateLimitHeader.includes('t=900'),
    `expected a RateLimit header advertising 30 in 900s, received ${blocked.rateLimitHeader}`,
  );
});

test('the chat limit is per user: a second user is not blocked by the first flood', async () => {
  const blockedUser = token('rate-limit-patient-1');
  const firstAttempt = await postChat(baseUrl, blockedUser);
  assert.equal(firstAttempt.status, 429, 'the flooded user must still be limited');

  const freshUser = token('rate-limit-patient-2');
  const freshAttempt = await postChat(baseUrl, freshUser);
  assert.ok(
    freshAttempt.status >= 200 && freshAttempt.status < 300,
    `a different user must not be blocked by another user's flood, got ${freshAttempt.status}`,
  );
});
