const introspectionStore = require('../services/introspectionStore');
const revocationStore = require('../services/revocationStore');
const auditLog = require('../services/auditLog');
const metrics = require('../services/metrics');

const introspectionCache = new Map();
const CACHE_TTL_MS = Number(process.env.INTROSPECTION_CACHE_TTL_MS || 5000);

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice('Bearer '.length);
}

async function callIntrospection(token) {
  if (process.env.INTROSPECTION_URL) {
    const response = await fetch(process.env.INTROSPECTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(Number(process.env.INTROSPECTION_TIMEOUT_MS || 2500)),
    });
    if (!response.ok) {
      throw new Error(`introspection_http_${response.status}`);
    }
    return response.json();
  }
  return introspectionStore.introspect(token);
}

async function introspectToken(req, res, next) {
  const started = process.hrtime.bigint();
  const token = getBearerToken(req);
  if (!token) {
    metrics.inc('introspection_requests_total', { result: 'missing_token' });
    auditLog.write('introspection_fail', { reason: 'missing_token', path: req.path });
    return res.status(401).json({ error: 'missing_token' });
  }

  if (revocationStore.isRevoked(token)) {
    metrics.inc('revoked_token_total');
    auditLog.write('revoked_token', { mode: 'introspection', path: req.path });
    return res.status(401).json({ error: 'revoked_token' });
  }

  try {
    const cached = introspectionCache.get(token);
    let result;
    if (cached && cached.expiresAt > Date.now()) {
      result = cached.result;
    } else {
      result = await callIntrospection(token);
      introspectionCache.set(token, {
        result,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
    }

    if (!result.active) {
      metrics.inc('introspection_requests_total', { result: 'inactive' });
      auditLog.write('introspection_inactive', { path: req.path });
      return res.status(401).json({ error: 'inactive_token' });
    }
    if (result.exp && result.exp <= Math.floor(Date.now() / 1000)) {
      return res.status(401).json({ error: 'expired_token' });
    }
    if (!result.sub || !result.client_id) {
      return res.status(401).json({ error: 'invalid_introspection_response' });
    }

    req.introspection = result;
    req.user = {
      sub: result.sub,
      preferred_username: result.username || result.sub,
      client_id: result.client_id,
      scope: result.scope,
      exp: result.exp,
      token_validation_mode: 'introspection',
    };
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    metrics.observe('introspection_latency_ms', durationMs);
    metrics.inc('introspection_requests_total', { result: 'active' });
    auditLog.write('introspection_success', {
      sub: result.sub,
      client_id: result.client_id,
      duration_ms: Number(durationMs.toFixed(3)),
    });
    next();
  } catch (error) {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    metrics.observe('introspection_latency_ms', durationMs);
    metrics.inc('introspection_requests_total', { result: 'error' });
    auditLog.write('introspection_fail', {
      reason: error.message,
      duration_ms: Number(durationMs.toFixed(3)),
    });
    return res.status(503).json({
      error: 'introspection_unavailable',
      message: error.message,
    });
  }
}

module.exports = {
  introspectToken,
};
