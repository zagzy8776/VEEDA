import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import sql from '../db.js';
import { audit, createRequireAuth } from '../security.js';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_COOKIE_NAME = 'veda_refresh_token';
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

function readCookie(req, name) {
  const cookieHeader = req.headers.cookie;
  if (typeof cookieHeader !== 'string') return '';

  const cookie = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!cookie) return '';

  const value = cookie.slice(name.length + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

function setRefreshCookie(res, rawToken) {
  res.cookie(REFRESH_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/auth',
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/auth',
  });
}

function requireCookieCsrf({ allowedOrigins }) {
  return (req, res, next) => {
    const origin = req.get('origin');
    const hasAllowedOrigin = typeof origin === 'string' && allowedOrigins.includes(origin);
    const hasRequestedWith = req.get('x-requested-with') === 'XMLHttpRequest';

    if (!hasAllowedOrigin || !hasRequestedWith) {
      return res.status(403).json({ error: 'Invalid authentication request origin' });
    }

    return next();
  };
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

function safeIpRateLimitKey(req) {
  const forwardedChain = Array.isArray(req.ips) ? req.ips : [];
  // With trust proxy=2, a valid Vercel -> Render request exposes exactly two
  // forwarded addresses. Any longer chain may contain client-supplied values;
  // use the immediate peer instead of allowing the client to choose a bucket.
  if (forwardedChain.length === 2 && req.ip === forwardedChain[0]) return `ip:${ipKeyGenerator(req.ip)}`;
  if (forwardedChain.length === 0) return `ip:${ipKeyGenerator(req.socket.remoteAddress || req.ip || 'unknown')}`;
  return `proxy:${ipKeyGenerator(req.socket.remoteAddress || 'unknown')}`;
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
  allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map((origin) => origin.trim()).filter(Boolean),
} = {}) {
  assertJwtSecret(jwtSecret);

  const router = Router();
  const authLimiter = genericRateLimit('Too many authentication requests');
  const loginIpLimiter = loginRateLimit(safeIpRateLimitKey);
  const loginEmailLimiter = loginRateLimit((req) => normalizeEmail(req.body?.email) || 'missing-email');
  const requireClaimAuth = createRequireAuth({ secret: jwtSecret, issuer, audience });
  const requireRefreshCookieCsrf = requireCookieCsrf({ allowedOrigins });
  const claimLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    keyGenerator: (req) => `claim:${req.user.id}`,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: 'Too many legacy ID claim attempts' }),
  });

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
      // Log server-side with the real reason. This catch previously discarded the
      // error entirely, so a missing `users` table surfaced only as an opaque 500
      // in the client with nothing in the logs to explain it.
      console.error('register failed:', error);
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
        setRefreshCookie(res, refreshToken.rawToken);
        return res.json({
          accessToken,
          expiresIn: 900,
          user: { id: user.id, email: user.email, role: user.role },
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('login failed:', error);
      return res.status(500).json({ error: 'Unable to log in at this time' });
    }
  });

  router.post('/refresh', requireRefreshCookieCsrf, async (req, res) => {
    const rawRefreshToken = readCookie(req, REFRESH_COOKIE_NAME);
    if (!rawRefreshToken) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT rt.id, rt.user_id, rt.token_hash, rt.expires_at, rt.revoked_at,
                u.email, u.role
         FROM refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
         WHERE rt.token_hash = $1
         FOR UPDATE`,
        [tokenHash],
      );
      const tokenRecord = result.rows[0];
      if (!tokenRecord) {
        await client.query('ROLLBACK');
        return res.status(401).json({ error: 'Invalid refresh token' });
      }

      if (tokenRecord.revoked_at) {
        await client.query(
          `UPDATE refresh_tokens
           SET revoked_at = COALESCE(revoked_at, NOW())
           WHERE user_id = $1`,
          [tokenRecord.user_id],
        );
        await client.query('COMMIT');
        return res.status(401).json({ error: 'Invalid refresh token' });
      }

      if (new Date(tokenRecord.expires_at) <= new Date()) {
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
      setRefreshCookie(res, refreshToken.rawToken);
      return res.json({
        accessToken,
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

  router.post('/logout', requireRefreshCookieCsrf, async (req, res) => {
    const rawRefreshToken = readCookie(req, REFRESH_COOKIE_NAME);
    if (rawRefreshToken) {
      const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
      await db.query(
        `UPDATE refresh_tokens
         SET revoked_at = COALESCE(revoked_at, NOW())
         WHERE token_hash = $1`,
        [tokenHash],
      );
    }
    clearRefreshCookie(res);
    return res.json({ ok: true });
  });

  router.post('/claim-legacy-id', requireClaimAuth, claimLimiter, async (req, res) => {
    const legacyPatientId = typeof req.body?.legacy_patient_id === 'string'
      ? req.body.legacy_patient_id.trim()
      : '';
    const tenantId = process.env.DEFAULT_TENANT_ID || 'default';

    if (!legacyPatientId || legacyPatientId.length > 255) {
      await audit(req, 'ACCESS_DENIED', legacyPatientId || null, {}, db);
      return res.status(400).json({ error: 'legacy_patient_id is required' });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        `SELECT id
         FROM patient_identity_mappings
         WHERE tenant_id = $1 AND user_id = $2
         FOR UPDATE`,
        [tenantId, req.user.id],
      );
      if (existing.rows.length) {
        await client.query('ROLLBACK');
        await audit(req, 'ACCESS_DENIED', legacyPatientId, {}, db);
        return res.status(409).json({ error: 'User already has a legacy identity mapping' });
      }

      await client.query(
        `INSERT INTO patient_identity_mappings (user_id, tenant_id, legacy_patient_id)
         VALUES ($1, $2, $3)`,
        [req.user.id, tenantId, legacyPatientId],
      );
      await audit(req, 'CREATE', legacyPatientId, {}, client);
      await client.query('COMMIT');
      return res.status(201).json({ ok: true });
    } catch (error) {
      await client.query('ROLLBACK');
      await audit(req, 'ACCESS_DENIED', legacyPatientId, {}, db);
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Legacy patient identity is already claimed' });
      }
      return res.status(500).json({ error: 'Unable to claim legacy patient identity' });
    } finally {
      client.release();
    }
  });

  return router;
}

export default createAuthRouter();