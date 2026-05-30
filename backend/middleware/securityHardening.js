const auditLog = require('../services/auditLog');
const metrics = require('../services/metrics');

const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 120);
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 1024 * 1024);
const clients = new Map();

function prune(now) {
  for (const [key, state] of clients.entries()) {
    if (state.resetAt <= now) {
      clients.delete(key);
    }
  }
}

function hardeningHeaders(req, res, next) {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('pragma', 'no-cache');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  next();
}

function requireJsonForWrites(req, res, next) {
  const hasBody = Number(req.headers['content-length'] || 0) > 0 || Boolean(req.headers['transfer-encoding']);
  if (hasBody && ['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
    metrics.inc('request_rejected_total', { reason: 'unsupported_media_type' });
    auditLog.write('request_rejected', {
      reason: 'unsupported_media_type',
      method: req.method,
      path: req.path,
      trace_id: req.trace?.traceId,
    });
    return res.status(415).json({
      error: 'unsupported_media_type',
      message: 'Write requests must use Content-Type: application/json',
    });
  }
  next();
}

function rejectLargeBody(req, res, next) {
  const length = Number(req.headers['content-length'] || 0);
  if (length > MAX_BODY_BYTES) {
    metrics.inc('request_rejected_total', { reason: 'body_too_large' });
    auditLog.write('request_rejected', {
      reason: 'body_too_large',
      method: req.method,
      path: req.path,
      content_length: length,
      trace_id: req.trace?.traceId,
    });
    return res.status(413).json({
      error: 'body_too_large',
      message: `Request body exceeds ${MAX_BODY_BYTES} bytes`,
    });
  }
  next();
}

function rateLimit(req, res, next) {
  const now = Date.now();
  prune(now);

  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const state = clients.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  state.count += 1;
  clients.set(key, state);

  res.setHeader('x-ratelimit-limit', RATE_LIMIT_MAX);
  res.setHeader('x-ratelimit-remaining', Math.max(0, RATE_LIMIT_MAX - state.count));
  res.setHeader('x-ratelimit-reset', Math.ceil(state.resetAt / 1000));

  if (state.count > RATE_LIMIT_MAX) {
    metrics.inc('request_rejected_total', { reason: 'rate_limited' });
    auditLog.write('request_rejected', {
      reason: 'rate_limited',
      method: req.method,
      path: req.path,
      trace_id: req.trace?.traceId,
    });
    return res.status(429).json({
      error: 'rate_limited',
      message: 'Too many requests',
    });
  }

  next();
}

module.exports = {
  hardeningHeaders,
  rateLimit,
  rejectLargeBody,
  requireJsonForWrites,
};
