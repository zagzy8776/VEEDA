import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import sql from '../db.js';

const REFRESH_COOKIE_NAME = 'veda_refresh_token';
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL_MS = Number(process.env.REFRESH_TOKEN_TTL_MS || 1000 * 60 * 60 * 24 * 30);
const COMMON_PASSWORDS = new Set(['password','password123','1234567890','qwerty12345','letmein1234']);

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 10) return 'Password must be at least 10 characters';
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'Password is too common';
  return null;
}

function assertJwtSecret(jwtSecret) {
  if (typeof jwtSecret !== 'string' || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be configured and at least 32 characters long.');
  }
}

function createAccessToken(user, { jwtSecret, issuer, audience }) {
  return jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: ACCESS_TOKEN_TTL, issuer, audience });
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
  try { return decodeURIComponent(value); } catch { return ''; }
}

function setRefreshCookie(res, rawToken) {
  res.cookie(REFRESH_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/auth',
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
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

function loginRateLimit(keyGenerator) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator,
    handler: (_req, res) => res.status(429).json({ error: 'Too many login attempts' }),
  });
}

function safeIpRateLimitKey(req) {
  return ipKeyGenerator(req.ip || req.socket?.remoteAddress || 'unknown');
}

async function issueRefreshToken(client, userId) {
  const { rawToken, tokenHash } = createRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await client.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt.toISOString()],
  );
  return { rawToken, expiresAt };
}

function createAuthRouter(options = {}) {
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
  const issuer = options.issuer || process.env.JWT_ISSUER || 'veeda-api';
  const audience = options.audience || process.env.JWT_AUDIENCE || 'veeda-client';
  const allowedOrigins = (options.allowedOrigins
    || (process.env.FRONTEND_URL || '').split(',').map((o) => o.trim()).filter(Boolean));
  assertJwtSecret(jwtSecret);

  const router = Router();
  const requireRefreshCookieCsrf = requireCookieCsrf({ allowedOrigins });
  const loginIpLimiter = loginRateLimit(safeIpRateLimitKey);
  const loginEmailLimiter = loginRateLimit((req) => normalizeEmail(req.body?.email) || 'missing-email');

  router.post('/register', loginIpLimiter, async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = req.body?.password;
      if (!isValidEmail(email)) return res.status(400).json({ error: 'Valid email is required' });
      const passwordError = validatePassword(password);
      if (passwordError) return res.status(400).json({ error: passwordError });
      const passwordHash = await bcrypt.hash(password, 12);
      const { rows } = await sql.query(
        `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'patient')
         ON CONFLICT (email) DO NOTHING
         RETURNING id, email, role`,
        [email, passwordHash],
      );
      if (!rows[0]) return res.status(409).json({ error: 'An account with this email already exists' });
      return res.status(201).json({ ok: true });
    } catch (error) {
      console.error('register failed:', error);
      return res.status(500).json({ error: 'Unable to register at this time' });
    }
  });

  router.post('/login', loginIpLimiter, loginEmailLimiter, async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = req.body?.password;
      if (!isValidEmail(email) || typeof password !== 'string') {
        return res.status(400).json({ error: 'Email and password are required' });
      }
      const { rows } = await sql.query(
        `SELECT id, email, role, password_hash FROM users WHERE email = $1 LIMIT 1`,
        [email],
      );
      const user = rows[0];
      if (!user) return res.status(401).json({ error: 'Invalid email or password' });
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
      const accessToken = createAccessToken(user, { jwtSecret, issuer, audience });
      const client = await sql.connect();
      try {
        await client.query('BEGIN');
        const refreshToken = await issueRefreshToken(client, user.id);
        await client.query('COMMIT');
        setRefreshCookie(res, refreshToken.rawToken);
        return res.json({
          accessToken,
          user: { id: user.id, email: user.email, role: user.role },
        });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('login failed:', error);
      return res.status(500).json({ error: 'Unable to log in at this time' });
    }
  });

  router.post('/refresh', requireRefreshCookieCsrf, async (req, res) => {
    const raw = readCookie(req, REFRESH_COOKIE_NAME);
    if (!raw) return res.status(401).json({ error: 'Invalid refresh token' });
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    const client = await sql.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at, u.email, u.role
         FROM refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
         WHERE rt.token_hash = $1
         LIMIT 1
         FOR UPDATE`,
        [tokenHash],
      );
      const tokenRecord = rows[0];
      if (!tokenRecord || tokenRecord.revoked_at || new Date(tokenRecord.expires_at) < new Date()) {
        await client.query('ROLLBACK');
        clearRefreshCookie(res);
        return res.status(401).json({ error: 'Invalid refresh token' });
      }
      await client.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [tokenRecord.id]);
      const accessToken = createAccessToken(
        { id: tokenRecord.user_id, role: tokenRecord.role },
        { jwtSecret, issuer, audience },
      );
      const refreshToken = await issueRefreshToken(client, tokenRecord.user_id);
      await client.query('COMMIT');
      setRefreshCookie(res, refreshToken.rawToken);
      return res.json({
        accessToken,
        user: { id: tokenRecord.user_id, email: tokenRecord.email, role: tokenRecord.role },
      });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('refresh failed:', error);
      return res.status(500).json({ error: 'Unable to refresh session at this time' });
    } finally {
      client.release();
    }
  });

  router.post('/logout', requireRefreshCookieCsrf, async (req, res) => {
    const raw = readCookie(req, REFRESH_COOKIE_NAME);
    if (raw) {
      const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
      try {
        await sql.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`, [tokenHash]);
      } catch (error) {
        console.error('logout revoke failed:', error);
      }
    }
    clearRefreshCookie(res);
    return res.json({ ok: true });
  });

  return router;
}

export default createAuthRouter();
