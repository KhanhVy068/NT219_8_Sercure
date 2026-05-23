const auditLog = require('../services/auditLog');

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
    });
  });
  next();
}

module.exports = requestLogger;
