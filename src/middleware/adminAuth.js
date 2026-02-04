const crypto = require('crypto');
const env = require('../config/env');

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key) cookies[key.trim()] = rest.join('=').trim();
  }
  return cookies;
}

function verifyJwt(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  if (expectedSig !== signatureB64) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function adminAuth(req, res, next) {
  if (!env.adminJwtSecret) {
    return res.status(503).json({ error: { code: 'ADMIN_DISABLED', message: 'Admin panel not configured' } });
  }

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.admin_token;

  if (!token) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
  }

  const payload = verifyJwt(token, env.adminJwtSecret);
  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
  }

  req.admin = payload;
  next();
}

module.exports = adminAuth;
module.exports.verifyJwt = verifyJwt;
module.exports.parseCookies = parseCookies;
