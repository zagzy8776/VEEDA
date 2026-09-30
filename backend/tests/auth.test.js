import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-at-least-32-chars';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';

const { createAuthRouter } = await import('../routes/auth.js');

const TEST_PASSWORD = 'correct-horse-battery';
const TEST_SECRET = process.env.JWT_SECRET;
const TEST_ORIGIN = 'https://frontend.example.com';

function createMemoryDb() {
  const users = [];
  const refreshTokens = [];

  async function query(text, params = []) {
    const sql = text.replace(/\s+/g, ' ').trim();

    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [] };
    }

    if (sql.startsWith('SELECT id FROM users WHERE LOWER(email)')) {
      const email = params[0];
      return { rows: users.filter((user) => user.email === email).map(({ id }) => ({ id })) };
    }

    if (sql.startsWith('INSERT INTO users')) {
      const [email, passwordHash] = params;
      if (users.some((user) => user.email === email)) {
        const error = new Error('duplicate email');
        error.code = '23505';
        throw error;
      }
      const user = {
        id: crypto.randomUUID(),
        email,
        password_hash: passwordHash,
        role: 'patient',
        created_at: new Date().toISOString(),
      };
      users.push(user);
      return { rows: [{ id: user.id, email: user.email, role: user.role, created_at: user.created_at }] };
    }

    if (sql.startsWith('SELECT id, email, password_hash, role FROM users')) {
      const email = params[0];
      return { rows: users.filter((user) => user.email === email) };
    }

    if (sql.startsWith('INSERT INTO refresh_tokens')) {
      const [userId, tokenHash, expiresAt] = params;
      refreshTokens.push({
        id: crypto.randomUUID(),
        user_id: userId,
        token_hash: tokenHash,
        expires_at: new Date(expiresAt),
        revoked_at: null,
        created_at: new Date(),
      });
      return { rows: [] };
    }

    if (sql.startsWith('SELECT rt.id, rt.user_id')) {
      const tokenHash = params[0];
      const token = refreshTokens.find((candidate) => candidate.token_hash === tokenHash);
      if (!token) return { rows: [] };
      const user = users.find((candidate) => candidate.id === token.user_id);
      return {
        rows: user ? [{
          id: token.id,
          user_id: token.user_id,
          token_hash: token.token_hash,
          expires_at: token.expires_at,
          revoked_at: token.revoked_at,
          email: user.email,
          role: user.role,
        }] : [],
      };
    }

    if (sql.startsWith('UPDATE refresh_tokens SET revoked_at = NOW()')) {
      const token = refreshTokens.find((candidate) => candidate.id === params[0] && !candidate.revoked_at);
      if (!token) return { rows: [] };
      token.revoked_at = new Date();
      return { rows: [{ id: token.id }] };
    }

    if (sql.startsWith('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id')) {
      for (const token of refreshTokens) {
        if (token.user_id === params[0] && !token.revoked_at) token.revoked_at = new Date();
      }
      return { rows: [] };
    }

    if (sql.startsWith('UPDATE refresh_tokens SET revoked_at = COALESCE')) {
      const token = refreshTokens.find((candidate) => candidate.token_hash === params[0]);
      if (token && !token.revoked_at) token.revoked_at = new Date();
      return { rows: [] };
    }

    throw new Error(`Unexpected SQL in auth test database: ${sql}`);
  }

  return {
    users,
    refreshTokens,
    query,
    async connect() {
      return {
        query,
        release() {},
      };
    },
  };
}

async function startTestApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter({
    db,
    jwtSecret: TEST_SECRET,
    issuer: process.env.JWT_ISSUER,
    audience: process.env.JWT_AUDIENCE,
    allowedOrigins: [TEST_ORIGIN],
  }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function request(baseUrl, path, body, { cookie = '', origin = TEST_ORIGIN, requestedWith = 'XMLHttpRequest' } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  if (origin !== undefined) headers.origin = origin;
  if (requestedWith !== undefined) headers['x-requested-with'] = requestedWith;
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
  return { status: response.status, body: await response.json(), setCookies };
}

function cookieValue(setCookie) {
  return setCookie.split(';', 1)[0];
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('registers a patient and ignores a client-selected role', async () => {
  const db = createMemoryDb();
  const testApp = await startTestApp(db);
  try {
    const result = await request(testApp.baseUrl, '/auth/register', {
      email: 'Patient@Example.com',
      password: TEST_PASSWORD,
      role: 'admin',
    });
    assert.equal(result.status, 201);
    assert.deepEqual(result.body.user.role, 'patient');
    assert.equal(result.body.user.email, 'patient@example.com');
    assert.equal(db.users[0].role, 'patient');
    assert.equal(await bcrypt.compare(TEST_PASSWORD, db.users[0].password_hash), true);
  } finally {
    await closeServer(testApp.server);
  }
});

test('rejects duplicate email with a generic registration error', async () => {
  const db = createMemoryDb();
  const testApp = await startTestApp(db);
  try {
    await request(testApp.baseUrl, '/auth/register', { email: 'a@b.com', password: TEST_PASSWORD });
    const result = await request(testApp.baseUrl, '/auth/register', { email: 'A@B.COM', password: TEST_PASSWORD });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'Unable to register with those details');
  } finally {
    await closeServer(testApp.server);
  }
});

test('rejects weak and common passwords', async () => {
  const db = createMemoryDb();
  const testApp = await startTestApp(db);
  try {
    const shortPassword = await request(testApp.baseUrl, '/auth/register', { email: 'short@example.com', password: 'short' });
    const commonPassword = await request(testApp.baseUrl, '/auth/register', { email: 'common@example.com', password: 'password123' });
    assert.equal(shortPassword.status, 400);
    assert.equal(commonPassword.status, 400);
  } finally {
    await closeServer(testApp.server);
  }
});

test('logs in with bcrypt and returns an issuer/audience-bound access JWT in JSON plus a secure refresh cookie', async () => {
  const db = createMemoryDb();
  const testApp = await startTestApp(db);
  try {
    await request(testApp.baseUrl, '/auth/register', { email: 'login@example.com', password: TEST_PASSWORD });
    const result = await request(testApp.baseUrl, '/auth/login', { email: 'LOGIN@example.com', password: TEST_PASSWORD });
    assert.equal(result.status, 200);
    assert.equal(typeof result.body.accessToken, 'string');
    assert.equal(result.body.refreshToken, undefined);
    assert.equal(result.body.expiresIn, 900);
    assert.equal(result.setCookies.length, 1);
    assert.match(result.setCookies[0], /^veda_refresh_token=[^;]+/);
    assert.match(result.setCookies[0], /HttpOnly/i);
    assert.match(result.setCookies[0], /Secure/i);
    assert.match(result.setCookies[0], /SameSite=Strict/i);
    assert.match(result.setCookies[0], /Path=\/auth/i);
    assert.equal(db.refreshTokens.length, 1);

    const claims = jwt.verify(result.body.accessToken, TEST_SECRET, {
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
    });
    assert.equal(claims.role, 'patient');
    assert.equal(claims.sub, db.users[0].id);
  } finally {
    await closeServer(testApp.server);
  }
});

test('uses the same generic error for wrong email and wrong password', async () => {
  const db = createMemoryDb();
  const testApp = await startTestApp(db);
  try {
    await request(testApp.baseUrl, '/auth/register', { email: 'known@example.com', password: TEST_PASSWORD });
    const wrongPassword = await request(testApp.baseUrl, '/auth/login', { email: 'known@example.com', password: 'wrong-password-123' });
    const wrongEmail = await request(testApp.baseUrl, '/auth/login', { email: 'missing@example.com', password: 'wrong-password-123' });
    assert.equal(wrongPassword.status, 401);
    assert.equal(wrongEmail.status, 401);
    assert.equal(wrongPassword.body.error, wrongEmail.body.error);
  } finally {
    await closeServer(testApp.server);
  }
});

test('rotates refresh tokens and revokes the old token', async () => {
  const db = createMemoryDb();
  const testApp = await startTestApp(db);
  try {
    await request(testApp.baseUrl, '/auth/register', { email: 'refresh@example.com', password: TEST_PASSWORD });
    const login = await request(testApp.baseUrl, '/auth/login', { email: 'refresh@example.com', password: TEST_PASSWORD });
    const refresh = await request(testApp.baseUrl, '/auth/refresh', {}, { cookie: cookieValue(login.setCookies[0]) });
    assert.equal(refresh.status, 200);
    assert.equal(refresh.body.refreshToken, undefined);
    assert.equal(refresh.setCookies.length, 1);
    assert.equal(db.refreshTokens.filter((token) => token.revoked_at).length, 1);

    const reused = await request(testApp.baseUrl, '/auth/refresh', {}, { cookie: cookieValue(login.setCookies[0]) });
    assert.equal(reused.status, 401);
  } finally {
    await closeServer(testApp.server);
  }
});

test('refresh-token reuse revokes all refresh tokens for that user', async () => {
  const db = createMemoryDb();
  const testApp = await startTestApp(db);
  try {
    await request(testApp.baseUrl, '/auth/register', { email: 'reuse@example.com', password: TEST_PASSWORD });
    const firstLogin = await request(testApp.baseUrl, '/auth/login', { email: 'reuse@example.com', password: TEST_PASSWORD });
    const secondLogin = await request(testApp.baseUrl, '/auth/login', { email: 'reuse@example.com', password: TEST_PASSWORD });
    assert.equal(db.refreshTokens.filter((token) => !token.revoked_at).length, 2);

    const rotated = await request(testApp.baseUrl, '/auth/refresh', {}, { cookie: cookieValue(firstLogin.setCookies[0]) });
    assert.equal(rotated.status, 200);
    assert.equal(db.refreshTokens.filter((token) => !token.revoked_at).length, 2);

    const reused = await request(testApp.baseUrl, '/auth/refresh', {}, { cookie: cookieValue(firstLogin.setCookies[0]) });
    assert.equal(reused.status, 401);
    assert.equal(db.refreshTokens.filter((token) => !token.revoked_at).length, 0);
  } finally {
    await closeServer(testApp.server);
  }
});

test('refresh requires the cookie, allowed origin, and requested-with header', async () => {
  const db = createMemoryDb();
  const testApp = await startTestApp(db);
  try {
    await request(testApp.baseUrl, '/auth/register', { email: 'csrf@example.com', password: TEST_PASSWORD });
    const login = await request(testApp.baseUrl, '/auth/login', { email: 'csrf@example.com', password: TEST_PASSWORD });
    const cookie = cookieValue(login.setCookies[0]);

    const missingCookie = await request(testApp.baseUrl, '/auth/refresh', {}, { origin: TEST_ORIGIN });
    assert.equal(missingCookie.status, 401);

    const wrongOrigin = await request(testApp.baseUrl, '/auth/refresh', {}, { cookie, origin: 'https://attacker.example.com' });
    assert.equal(wrongOrigin.status, 403);

    const missingHeader = await request(testApp.baseUrl, '/auth/refresh', {}, { cookie, requestedWith: '' });
    assert.equal(missingHeader.status, 403);

    const refreshed = await request(testApp.baseUrl, '/auth/refresh', {}, { cookie });
    assert.equal(refreshed.status, 200);
  } finally {
    await closeServer(testApp.server);
  }
});

test('logout revokes the cookie refresh token and clears the cookie', async () => {
  const db = createMemoryDb();
  const testApp = await startTestApp(db);
  try {
    await request(testApp.baseUrl, '/auth/register', { email: 'logout@example.com', password: TEST_PASSWORD });
    const login = await request(testApp.baseUrl, '/auth/login', { email: 'logout@example.com', password: TEST_PASSWORD });
    const cookie = cookieValue(login.setCookies[0]);
    const logout = await request(testApp.baseUrl, '/auth/logout', {}, { cookie });
    assert.equal(logout.status, 200);
    assert.equal(logout.setCookies.length, 1);
    assert.match(logout.setCookies[0], /^veda_refresh_token=;/);
    assert.match(logout.setCookies[0], /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
    const refresh = await request(testApp.baseUrl, '/auth/refresh', {}, { cookie });
    assert.equal(refresh.status, 401);
  } finally {
    await closeServer(testApp.server);
  }
});

test('rate-limits login attempts by IP', async () => {
  const db = createMemoryDb();
  const testApp = await startTestApp(db);
  try {
    await request(testApp.baseUrl, '/auth/register', { email: 'rate@example.com', password: TEST_PASSWORD });
    const results = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      results.push(await request(testApp.baseUrl, '/auth/login', { email: 'rate@example.com', password: 'wrong-password-123' }));
    }
    assert.deepEqual(results.slice(0, 5).map((result) => result.status), [401, 401, 401, 401, 401]);
    assert.equal(results[5].status, 429);
  } finally {
    await closeServer(testApp.server);
  }
});

after(() => {
  delete process.env.JWT_SECRET;
  delete process.env.JWT_ISSUER;
  delete process.env.JWT_AUDIENCE;
});