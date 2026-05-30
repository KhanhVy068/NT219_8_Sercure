const auditLog = require('../services/auditLog');
const metrics = require('../services/metrics');

function requestLogger(req, res, next) {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    auditLog.write('http_request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Number(durationMs.toFixed(3)),
      ip: req.ip,
      request_id: req.trace?.requestId,
      trace_id: req.trace?.traceId,
      span_id: req.trace?.spanId,
    });
    metrics.inc('http_requests_total', { method: req.method, status: res.statusCode });
    metrics.observe('http_request_duration_ms', durationMs, {
      method: req.method,
      route: req.route?.path || req.path,
      status: res.statusCode,
    });
  });
  next();
}

module.exports = requestLogger;
