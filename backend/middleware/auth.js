const fs = require('fs');
const ES256_PUBLIC_KEY = fs.readFileSync('./es256-public.pem', 'utf8');
global.crypto = require('crypto').webcrypto;

const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/realms/DOAN';
const KEYCLOAK_JWKS_URI =
  process.env.KEYCLOAK_JWKS_URI ||
  'http://keycloak:8080/realms/DOAN/protocol/openid-connect/certs';

let JWKS;
let jwtVerify;

async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'missing_token',
      message: 'Missing Authorization: Bearer token',
    });
  }

  const token = authHeader.slice('Bearer '.length);
  const parts = token.split('.');
  const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
  const algorithm = header.alg;

  try {
    let payload;
    const jose = await import('jose');
    
    if (algorithm === 'RS256') {
      const verified = await jwtVerify(token, JWKS, {
        issuer: KEYCLOAK_ISSUER,
      });
      payload = verified.payload;
    }
    else if (algorithm === 'HS256') {
      const secret = new TextEncoder().encode('khóa-bi-mật-24byte-cho-hs256!!');
      const verified = await jose.jwtVerify(token, secret);
      payload = verified.payload;
    }
    else if (algorithm === 'ES256') {
      const publicKey = await jose.importSPKI(ES256_PUBLIC_KEY, 'ES256');
  const verified = await jose.jwtVerify(token, publicKey);
  payload = verified.payload;
    }
    
    req.user = {
      ...payload,
      token_algorithm: algorithm
    };
    next();
  } catch (error) {
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
}

module.exports = {
  authenticateToken,
  requireRealmRole,
  initializeJWT,
};