const crypto = require('crypto');
const express = require('express');
const http = require('http');

global.crypto = crypto.webcrypto;

const PORT = Number(process.env.PORT || 4000);
const GATEWAY_INTERNAL_TOKEN = process.env.GATEWAY_INTERNAL_TOKEN || 'demo-gateway-internal-token';
const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/realms/DOAN';
const KEYCLOAK_JWKS_URI =
  process.env.KEYCLOAK_JWKS_URI || 'http://keycloak:8080/realms/DOAN/protocol/openid-connect/certs';
const DEMO_JWT_ISSUER = process.env.DEMO_JWT_ISSUER || 'http://localhost:3001/demo-idp';
const DEMO_JWT_AUDIENCE = process.env.DEMO_JWT_AUDIENCE || 'secure-api';
const HS256_SECRET = process.env.HS256_SECRET || 'khoa-bi-mat-24byte-cho-hs256!!';

const ROUTES = [
  { prefix: '/api/users', target: new URL(process.env.USER_SERVICE_URL || 'http://user-service:3000') },
  { prefix: '/api/payments', target: new URL(process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3000') },
  { prefix: '/api/inventory', target: new URL(process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:3000') },
  { prefix: '/api/analytics', target: new URL(process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:3000') },
  { prefix: '/', target: new URL(process.env.LEGACY_BACKEND_URL || 'http://backend:3000') },
];

const IDENTITY_HEADERS = [
  'x-user-id',
  'x-roles',
  'x-client-id',
  'x-authenticated-user-id',
  'x-authenticated-client-id',
  'x-authenticated-roles',
  'x-authenticated-scopes',
  'x-authenticated-subject',
];

const counters = new Map();
let JWKS;
let jwtVerify;

function inc(name, labels = {}) {
  const key = `${name}:${JSON.stringify(labels)}`;
  counters.set(key, {
    name,
    labels,
    value: (counters.get(key)?.value || 0) + 1,
  });
}

function labelsToPrometheus(labels = {}) {
  const entries = Object.entries(labels);
  if (!entries.length) {
    return '';
  }
  return `{${entries.map(([key, value]) => `${key}="${String(value).replace(/"/g, '\\"')}"`).join(',')}}`;
}

function metricsText() {
  const lines = [];
  for (const counter of counters.values()) {
    lines.push(`# TYPE ${counter.name} counter`);
    lines.push(`${counter.name}${labelsToPrometheus(counter.labels)} ${counter.value}`);
  }
  return `${lines.join('\n')}\n`;
}

function isPublicPath(pathname) {
  return (
    pathname === '/health' ||
    pathname === '/metrics' ||
    pathname === '/metrics/prometheus' ||
    pathname === '/api/public' ||
    pathname.startsWith('/api/demo/token/') ||
    pathname.startsWith('/oauth/')
  );
}

function targetFor(pathname) {
  return ROUTES.find((route) => pathname === route.prefix || pathname.startsWith(`${route.prefix}/`)) || ROUTES.at(-1);
}

async function verifyJwt(req, res, next) {
  if (isPublicPath(req.path)) {
    req.trustedIdentity = {
      sub: 'anonymous',
      client_id: 'public',
      roles: [],
      scope: '',
    };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    inc('gateway_jwt_reject_total', { reason: 'missing_token' });
    return res.status(401).json({ error: 'missing_token', message: 'Missing Authorization: Bearer token' });
  }

  try {
    const token = authHeader.slice('Bearer '.length);
    const parts = token.split('.');
    if (parts.length !== 3) {
      inc('gateway_jwt_reject_total', { reason: 'bad_format' });
      return res.status(401).json({ error: 'invalid_token', message: 'JWT must have 3 parts' });
    }

    const jose = await import('jose');
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const algorithm = header.alg;
    let payload;

    if (algorithm === 'RS256') {
      const verified = await jwtVerify(token, JWKS, {
        issuer: KEYCLOAK_ISSUER,
        algorithms: ['RS256'],
      });
      payload = verified.payload;
    } else if (algorithm === 'HS256') {
      const verified = await jose.jwtVerify(token, new TextEncoder().encode(HS256_SECRET), {
        issuer: DEMO_JWT_ISSUER,
        audience: DEMO_JWT_AUDIENCE,
        algorithms: ['HS256'],
      });
      payload = verified.payload;
    } else {
      inc('gateway_jwt_reject_total', { reason: 'unsupported_alg' });
      return res.status(401).json({ error: 'unsupported_alg', message: `Unsupported JWT alg: ${algorithm || 'missing'}` });
    }

    req.trustedIdentity = {
      sub: payload.sub,
      client_id: payload.client_id || payload.azp || '',
      roles: payload.realm_access?.roles || [],
      scope: payload.scope || '',
    };
    inc('gateway_jwt_accept_total', { alg: algorithm });
    return next();
  } catch (error) {
    inc('gateway_jwt_reject_total', { reason: 'invalid_token' });
    return res.status(401).json({ error: 'invalid_token', message: error.message });
  }
}

function proxyRequest(req, res) {
  const route = targetFor(req.path);
  const targetUrl = new URL(req.originalUrl, route.target);
  const headers = { ...req.headers };

  for (const header of IDENTITY_HEADERS) {
    delete headers[header];
  }

  headers.host = route.target.host;
  headers['x-gateway-identity'] = 'kong-gateway-auth';
  headers['x-gateway-token'] = GATEWAY_INTERNAL_TOKEN;
  headers['x-authenticated-subject'] = req.trustedIdentity.sub || '';
  headers['x-authenticated-client-id'] = req.trustedIdentity.client_id || '';
  headers['x-authenticated-roles'] = (req.trustedIdentity.roles || []).join(',');
  headers['x-authenticated-scopes'] = req.trustedIdentity.scope || '';

  const upstream = http.request(
    {
      hostname: targetUrl.hostname,
      port: targetUrl.port || 80,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      res.status(upstreamRes.statusCode);
      for (const [name, value] of Object.entries(upstreamRes.headers)) {
        res.setHeader(name, value);
      }
      upstreamRes.pipe(res);
    }
  );

  upstream.on('error', (error) => {
    inc('gateway_proxy_error_total', { target: route.target.hostname });
    res.status(502).json({ error: 'bad_gateway', message: error.message });
  });

  req.pipe(upstream);
}

async function main() {
  const jose = await import('jose');
  jwtVerify = jose.jwtVerify;
  JWKS = jose.createRemoteJWKSet(new URL(KEYCLOAK_JWKS_URI));

  const app = express();
  app.get('/health', (req, res) => res.json({ status: 'healthy', service: 'gateway-auth' }));
  app.get('/metrics', (req, res) => res.type('text/plain').send(metricsText()));
  app.get('/metrics/prometheus', (req, res) => res.type('text/plain').send(metricsText()));
  app.use(verifyJwt);
  app.use(proxyRequest);

  app.listen(PORT, () => {
    console.log(`gateway-auth listening on ${PORT}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
