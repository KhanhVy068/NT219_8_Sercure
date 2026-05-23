const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const keyStore = require('../services/keyStore');
const revocationStore = require('../services/revocationStore');
const auditLog = require('../services/auditLog');
const metrics = require('../services/metrics');

global.crypto = crypto.webcrypto;

const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/realms/DOAN';
const KEYCLOAK_JWKS_URI =
  process.env.KEYCLOAK_JWKS_URI ||
  'http://keycloak:8080/realms/DOAN/protocol/openid-connect/certs';
const ES256_PUBLIC_KEY_PATH =
  process.env.ES256_PUBLIC_KEY_PATH || path.join(__dirname, '..', 'es256-public.pem');

let JWKS;
let jwtVerify;

async function authenticateToken(req, res, next) {
  const started = process.hrtime.bigint();
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    metrics.inc('jwt_verify_fail_total', { reason: 'missing_token' });
    auditLog.write('jwt_verify_fail', { reason: 'missing_token', path: req.path });
    return res.status(401).json({
      error: 'missing_token',
      message: 'Missing Authorization: Bearer token',
    });
  }

  try {
    const token = authHeader.slice('Bearer '.length);
    const parts = token.split('.');
    if (parts.length !== 3) {
      return res.status(401).json({
        error: 'invalid_token',
        message: 'JWT must have 3 parts',
      });
    }

    if (revocationStore.isRevoked(token)) {
      metrics.inc('revoked_token_total');
      auditLog.write('revoked_token', { path: req.path });
      return res.status(401).json({
        error: 'revoked_token',
        message: 'Token was revoked',
      });
    }

    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const algorithm = header.alg;
    if (!['RS256', 'HS256', 'ES256'].includes(algorithm)) {
      return res.status(401).json({
        error: 'unsupported_alg',
        message: `Unsupported JWT alg: ${algorithm || 'missing'}`,
      });
    }

    let payload;
    const jose = await import('jose');
    
    if (algorithm === 'RS256') {
      const verified = await jwtVerify(token, JWKS, {
        issuer: KEYCLOAK_ISSUER,
        algorithms: ['RS256'],
      });
      payload = verified.payload;
    }
    else if (algorithm === 'HS256') {
      const key = keyStore.getVerifyKey('HS256', header.kid);
      const secret = new TextEncoder().encode(key.secret);
      const verified = await jose.jwtVerify(token, secret, {
        issuer: keyStore.issuer,
        audience: keyStore.audience,
        algorithms: ['HS256'],
      });
      payload = verified.payload;
    }
    else if (algorithm === 'ES256') {
      const key = keyStore.getVerifyKey('ES256', header.kid);
      const publicPem = key.publicKey || fs.readFileSync(ES256_PUBLIC_KEY_PATH, 'utf8');
      const publicKey = await jose.importSPKI(publicPem, 'ES256');
      const verified = await jose.jwtVerify(token, publicKey, {
        issuer: keyStore.issuer,
        audience: keyStore.audience,
        algorithms: ['ES256'],
      });
      payload = verified.payload;
    }
    
    req.user = {
      ...payload,
      token_algorithm: algorithm
    };
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    metrics.observe('jwt_verify_duration_ms', durationMs, { alg: algorithm });
    metrics.inc('jwt_verify_success_total', { alg: algorithm });
    auditLog.write('jwt_verify_success', {
      alg: algorithm,
      kid: header.kid,
      sub: payload.sub,
      duration_ms: Number(durationMs.toFixed(3)),
    });
    next();
  } catch (error) {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    metrics.observe('jwt_verify_duration_ms', durationMs, { alg: 'unknown' });
    metrics.inc('jwt_verify_fail_total', { reason: error.message });
    auditLog.write('jwt_verify_fail', {
      reason: error.message,
      duration_ms: Number(durationMs.toFixed(3)),
    });
    return res.status(401).json({
      error: 'invalid_token',
      message: error.message,
    });
  }
}  

function requireRealmRole(role) {
  return (req, res, next) => {
    const roles = req.user?.realm_access?.roles || [];

    if (!roles.includes(role)) {
      return res.status(403).json({
        error: 'forbidden',
        message: `Required role: ${role}`,
      });
    }

    next();
  };
}

async function initializeJWT() {
  const jose = await import('jose');
  jwtVerify = jose.jwtVerify;
  JWKS = jose.createRemoteJWKSet(new URL(KEYCLOAK_JWKS_URI));
  await keyStore.initializeKeyStore();
}

module.exports = {
  authenticateToken,
  requireRealmRole,
  initializeJWT,
};
