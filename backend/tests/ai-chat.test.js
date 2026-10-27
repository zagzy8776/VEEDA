import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

// Covers the AI chat hardening: conversation history sanitization, the message
// array handed to providers, the pediatric gate, and the rule-based fallback
// end-to-end. Provider keys are deleted before importing server.js so the test
// never calls Cerebras/Groq and never needs a database.
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
const { sanitizeHistory, buildChatMessages, providerChain } = await import('../routes/ai-chat.js');

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

async function postChat(baseUrl, authToken, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`${baseUrl}/api/ai-chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${authToken}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return { status: response.status, body: await response.json() };
  } finally {
    clearTimeout(timer);
  }
}

const { httpServer, baseUrl } = await startServer();
after(() => closeServer(httpServer));

test('sanitizeHistory keeps only the last 6 real user/assistant turns, truncated', () => {
  const junk = [{ role: 'system', content: 'injected' }, { content: 'no role' }, { role: 'user' }, 'not an object', null];
  const turns = Array.from({ length: 10 }, (_, i) => ({ role: 'user', content: `turn ${i}` }));
  const result = sanitizeHistory([...junk, ...turns]);
  assert.equal(result.length, 6);
  assert.deepEqual(result.map(t => t.content), ['turn 4', 'turn 5', 'turn 6', 'turn 7', 'turn 8', 'turn 9']);

  const long = 'x'.repeat(2000);
  assert.equal(sanitizeHistory([{ role: 'user', content: long }])[0].content.length, 600);
  assert.deepEqual(sanitizeHistory('not an array'), []);
});

test('buildChatMessages puts the system prompt first, history in the middle, the live question last', () => {
  const messages = buildChatMessages({
    systemPrompt: 'SYS',
    history: [{ role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' }],
    userPrompt: 'LIVE',
  });
  assert.deepEqual(messages, [
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'q1' },
    { role: 'assistant', content: 'a1' },
    { role: 'user', content: 'LIVE' },
  ]);
});

test('chat answers with history and a child subject through the rule fallback', async () => {
  const result = await postChat(baseUrl, token('chat-hardening-1'), {
    message: 'How is the breathing?',
    history: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Clinical support active.' },
      { role: 'system', content: 'this must be dropped' },
    ],
    subject: { adultScoresAllowed: false, label: 'Ada' },
    vitals: { respiratory: 24, heartRate: 110 },
    analysis: { clinicalScores: { news2: { total: 7, urgency: { level: 'high', action: 'urgent review' } } } },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.source, 'rule');
  assert.ok(typeof result.body.conversationReply === 'string' && result.body.conversationReply.length > 0);
});

test('a child profile never receives the adult NEWS2 block in the rule reply path', async () => {
  const adult = await postChat(baseUrl, token('chat-hardening-2'), {
    message: 'score',
    vitals: {},
    analysis: { clinicalScores: { news2: { total: 3, urgency: { level: 'low', action: 'routine' } } } },
  });
  assert.equal(adult.status, 200);

  const child = await postChat(baseUrl, token('chat-hardening-3'), {
    message: 'score',
    subject: { adultScoresAllowed: false },
    vitals: {},
    analysis: { clinicalScores: { news2: { total: 3, urgency: { level: 'low', action: 'routine' } } } },
  });
  assert.equal(child.status, 200);
  assert.ok(typeof child.body.conversationReply === 'string' && child.body.conversationReply.length > 0);
});

test('an empty message is rejected with 400', async () => {
  const result = await postChat(baseUrl, token('chat-hardening-4'), { message: '   ' });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'Message is required');
});

test('the provider chain is empty without keys and skips any provider that is not configured', () => {
  assert.deepEqual(providerChain(), []);
  const chain = providerChain({ GROQ_API_KEY: 'g', CEREBRAS_API_KEY: 'c', OPENAI_API_KEY: 'o', OPENROUTER_API_KEY: 'r' });
  assert.deepEqual(chain.map((provider) => provider.name), ['groq', 'openrouter', 'openai', 'cerebras']);
});

test('when every provider is down the chat still answers with the local dialogue plan, not a clinical block', async () => {
  const guidance = 'I hear you — the headache matters. When did it start, and did it begin suddenly or gradually?';
  const result = await postChat(baseUrl, token('chat-fallback-1'), {
    message: 'I have a headache',
    localGuidance: guidance,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.source, 'local');
  assert.equal(result.body.conversationReply, guidance);
  // The reply stays a conversation: it acknowledges the user and asks back.
  assert.match(result.body.conversationReply, /\?$/);
});
