import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import sql from '../db.js';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;
const GENERIC_LOGIN_ERROR = 'Invalid email or password';
const GENERIC_REGISTER_ERROR = 'Unable to register with those details';
const DUMMY_PASSWORD_HASH = '$2b$12$/9N/M2csHR2USUaYUe.RXeBFCWGtePpgOcwMq9O1s9Dy2UO3ic4gO';
const COMMON_PASSWORDS = new Set([
  '1234567890',
  'abcdefghij',
  'admin12345',
  'changeme123',
  'iloveyou123',
  'letmein123',
  'password123',
  'password1234',
  'qwertyuiop',
  'welcome123',
]);

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 10) {
    return 'Password must be at least 10 characters';
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'Password is too common';
  }
  return null;
}

function assertJwtSecret(jwtSecret) {
  if (typeof jwtSecret !== 'string' || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be configured and at least 32 characters long.');
  }
}

function createAccessToken(user, { jwtSecret, issuer, audience }) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    jwtSecret,
    { expiresIn: ACCESS_TOKEN_TTL, issuer, audience },
  );
}

function createRefreshToken() {
  const rawToken = crypto.randomBytes(48).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

function genericRateLimit(message) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: message }),
  });
}

function loginRateLimit(keyGenerator) {
  const options = {
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: 'Too many authentication attempts' }),
  };
  if (keyGenerator) options.keyGenerator = keyGenerator;
  return rateLimit(options);
}

function issueRefreshToken(client, userId) {
  const { rawToken, tokenHash } = createRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  return client.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  ).then(() => ({ rawToken, expiresAt }));
}

export function createAuthRouter({
  db = sql,
  jwtSecret = process.env.JWT_SECRET,
  issuer = process.env.JWT_ISSUER || 'veeda-api',
  audience = process.env.JWT_AUDIENCE || 'veeda-client',
} = {}) {
  assertJwtSecret(jwtSecret);

  const router = Router();
  const authLimiter = genericRateLimit('Too many authentication requests');
  const loginIpLimiter = loginRateLimit();
  const loginEmailLimiter = loginRateLimit((req) => normalizeEmail(req.body?.email) || 'missing-email');

  router.use(authLimiter);

  router.post('/register', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const { password } = req.body || {};
    const passwordError = validatePassword(password);

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    try {
      const existing = await db.query(
        'SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1',
        [email],
      );
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: GENERIC_REGISTER_ERROR });
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const result = await db.query(
        `INSERT INTO users (email, password_hash, role)
         VALUES ($1, $2, 'patient')
         RETURNING id, email, role, created_at`,
        [email, passwordHash],
      );
      const user = result.rows[0];

      return res.status(201).json({
        user: { id: user.id, email: user.email, role: user.role },
      });
    } catch (error) {
      if (error?.code === '23505') {
        return res.status(400).json({ error: GENERIC_REGISTER_ERROR });
      }
      return res.status(500).json({ error: 'Unable to register at this time' });
    }
  });

  router.post('/login', loginIpLimiter, loginEmailLimiter, async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const { password } = req.body || {};

    if (!isValidEmail(email) || typeof password !== 'string') {
      await bcrypt.compare(typeof password === 'string' ? password : '', DUMMY_PASSWORD_HASH);
      return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    }

    try {
      const result = await db.query(
        `SELECT id, email, password_hash, role
         FROM users
         WHERE LOWER(email) = $1
         LIMIT 1`,
        [email],
      );
      const user = result.rows[0];
      const passwordHash = user?.password_hash || DUMMY_PASSWORD_HASH;
      const passwordMatches = await bcrypt.compare(password, passwordHash);

      if (!user || !passwordMatches) {
        return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
      }

      const accessToken = createAccessToken(user, { jwtSecret, issuer, audience });
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const refreshToken = await issueRefreshToken(client, user.id);
        await client.query('COMMIT');
        return res.json({
          accessToken,
          refreshToken: refreshToken.rawToken,
          expiresIn: 900,
          user: { id: user.id, email: user.email, role: user.role },
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch {
      return res.status(500).json({ error: 'Unable to log in at this time' });
    }
  });

  router.post('/refresh', async (req, res) => {
    const rawRefreshToken = typeof req.body?.refreshToken === 'string'
      ? req.body.refreshToken
      : '';
    if (!rawRefreshToken) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT rt.id, rt.user_id, rt.token_hash, u.email, u.role
         FROM refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
         WHERE rt.token_hash = $1
           AND rt.revoked_at IS NULL
           AND rt.expires_at > NOW()
         FOR UPDATE`,
        [tokenHash],
      );
      const tokenRecord = result.rows[0];
      if (!tokenRecord) {
        await client.query('ROLLBACK');
        return res.status(401).json({ error: 'Invalid refresh token' });
      }

      const revoked = await client.query(
        `UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE id = $1 AND revoked_at IS NULL
         RETURNING id`,
        [tokenRecord.id],
      );
      if (revoked.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(401).json({ error: 'Invalid refresh token' });
      }

      const accessToken = createAccessToken(tokenRecord, { jwtSecret, issuer, audience });
      const refreshToken = await issueRefreshToken(client, tokenRecord.user_id);
      await client.query('COMMIT');
      return res.json({
        accessToken,
        refreshToken: refreshToken.rawToken,
        expiresIn: 900,
        user: { id: tokenRecord.user_id, email: tokenRecord.email, role: tokenRecord.role },
      });
    } catch {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Unable to refresh session at this time' });
    } finally {
      client.release();
    }
  });

  router.post('/logout', async (req, res) => {
    const rawRefreshToken = typeof req.body?.refreshToken === 'string'
      ? req.body.refreshToken
      : '';
    if (rawRefreshToken) {
      const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
      await db.query(
        `UPDATE refresh_tokens
         SET revoked_at = COALESCE(revoked_at, NOW())
         WHERE token_hash = $1`,
        [tokenHash],
      );
    }
    return res.json({ ok: true });
  });

  return router;
}

export default createAuthRouter();