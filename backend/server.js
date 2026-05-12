const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

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

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: KEYCLOAK_ISSUER,
    });

    req.user = payload;
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

app.get('/api/public', (req, res) => {
  res.json({
    message: 'Public API is working!',
  });
});

app.get('/api/secure', authenticateToken, (req, res) => {
  res.json({
    message: 'Secure API is working!',
    user: req.user.preferred_username || req.user.client_id || req.user.azp,
    issuer: req.user.iss,
  });
});

app.get('/api/admin', authenticateToken, requireRealmRole('admin'), (req, res) => {
  res.json({
    message: 'Admin API is working!',
    user: req.user.preferred_username || req.user.client_id || req.user.azp,
  });
});

async function startServer() {
  const jose = await import('jose');

  jwtVerify = jose.jwtVerify;
  JWKS = jose.createRemoteJWKSet(new URL(KEYCLOAK_JWKS_URI));

  app.listen(3000, () => {
    console.log('Gateway running on port 3000');
  });
}

startServer().catch((error) => {
  console.error('Failed to start gateway:', error);
  process.exit(1);
});
