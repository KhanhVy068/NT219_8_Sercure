const crypto = require('crypto');

function parseTraceparent(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const parts = value.split('-');
  if (parts.length !== 4 || parts[1].length !== 32) {
    return null;
  }

  return {
    version: parts[0],
    traceId: parts[1],
    parentId: parts[2],
    flags: parts[3],
  };
}

function tracing(req, res, next) {
  const incoming = parseTraceparent(req.headers.traceparent);
  const traceId = incoming?.traceId || crypto.randomBytes(16).toString('hex');
  const spanId = crypto.randomBytes(8).toString('hex');
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();

  req.trace = {
    traceId,
    spanId,
    parentSpanId: incoming?.parentId,
    requestId,
  };

  res.setHeader('x-request-id', requestId);
  res.setHeader('traceparent', `00-${traceId}-${spanId}-01`);
  next();
}

module.exports = tracing;
