const express = require('express');
const auth = require('./middleware/auth');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const keyStore = require('./services/keyStore');
const introspectionStore = require('./services/introspectionStore');
const oauthRoutes = require('./routes/oauthRoutes');
const introspection = require('./middleware/introspection');
const requestLogger = require('./middleware/requestLogger');
const tracing = require('./middleware/tracing');
const securityHardening = require('./middleware/securityHardening');
const auditLog = require('./services/auditLog');
const metrics = require('./services/metrics');

const DEMO_JWT_ISSUER = process.env.DEMO_JWT_ISSUER || 'http://localhost:3000/demo-idp';
const DEMO_JWT_AUDIENCE = process.env.DEMO_JWT_AUDIENCE || 'secure-api';
const ES256_PRIVATE_KEY_PATH =
  process.env.ES256_PRIVATE_KEY_PATH || path.join(__dirname, 'es256-private.pem');
const HMAC_TIMESTAMP_WINDOW_MS = Number(process.env.HMAC_TIMESTAMP_WINDOW_MS || 60000);
const PORT = Number(process.env.PORT || 3000);
const GATEWAY_INTERNAL_TOKEN = process.env.GATEWAY_INTERNAL_TOKEN || 'demo-gateway-internal-token';
const usedNonces = new Map();

const app = express();

app.use(cors());
app.use(helmet());
app.use(tracing);
app.use(securityHardening.hardeningHeaders);
app.use(securityHardening.rateLimit);
app.use(securityHardening.rejectLargeBody);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    metrics.inc('request_rejected_total', { reason: 'body_too_large' });
    auditLog.write('request_rejected', {
      reason: 'body_too_large',
      method: req.method,
      path: req.path,
      content_length: Number(req.headers['content-length'] || 0),
      trace_id: req.trace?.traceId,
    });
    return res.status(413).json({
      error: 'body_too_large',
      message: `Request body exceeds ${process.env.MAX_BODY_BYTES || 1048576} bytes`,
    });
  }
  return next(err);
});
app.use(securityHardening.requireJsonForWrites);
app.use(requestLogger);
app.use('/oauth', oauthRoutes);

function requireGatewayIdentity(req, res, next) {
  if (
    req.path === '/api/demo/token/hs256' ||
    req.path === '/api/demo/token/es256'
  ) {
    return next();
  }

  if (req.headers['x-gateway-token'] !== GATEWAY_INTERNAL_TOKEN) {
    metrics.inc('request_rejected_total', { reason: 'missing_gateway_identity' });
    auditLog.write('request_rejected', {
      reason: 'missing_gateway_identity',
      method: req.method,
      path: req.path,
      trace_id: req.trace?.traceId,
    });
    return res.status(403).json({
      error: 'forbidden',
      message: 'Business API accepts requests only from the trusted gateway layer',
    });
  }

  req.gatewayIdentity = {
    source: req.headers['x-gateway-identity'],
    subject: req.headers['x-authenticated-subject'],
    clientId: req.headers['x-authenticated-client-id'],
    roles: String(req.headers['x-authenticated-roles'] || '').split(',').filter(Boolean),
    scopes: String(req.headers['x-authenticated-scopes'] || '').split(' ').filter(Boolean),
  };
  return next();
}

app.use('/api', requireGatewayIdentity);

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    traceId: req.trace?.traceId,
    vault: keyStore.getState().vault,
  });
});



app.get('/api/public', (req, res) => {
  res.json({
    message: 'Public API is working!',
  });
});

app.get('/api/secure', auth.authenticateToken, (req, res) => {
  res.json({
    message: 'Secure API is working!',
    user: req.user.preferred_username || req.user.client_id || req.user.azp,
    issuer: req.user.iss,
  });
});

app.get('/api/admin', auth.authenticateToken, auth.requireRealmRole('admin'), (req, res) => {
  res.json({
    message: 'Admin API is working!',
    user: req.user.preferred_username || req.user.client_id || req.user.azp,
  });
});

// ========== API THẬT: LẤY THÔNG TIN USER TỪ TOKEN ==========
app.get('/api/myinfo', auth.authenticateToken, (req, res) => {
  // Lấy thông tin từ token (Keycloak đã giải mã và gắn vào req.user)
  const userId = req.user.sub;
  const username = req.user.preferred_username;
  const email = req.user.email;
  const roles = req.user.realm_access?.roles || [];
  const firstName = req.user.given_name || '';
  const lastName = req.user.family_name || '';
  
  // Tính thời gian hết hạn của token
  const issuedAt = new Date(req.user.iat * 1000);
  const expiresAt = new Date(req.user.exp * 1000);
  
  // Trả về dữ liệu
  res.json({
    success: true,
    data: {
      userId: userId,
      username: username,
      email: email,
      fullName: `${firstName} ${lastName}`.trim() || username,
      roles: roles,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString()
    }
  });
});
// JWT validation (HS256, ES256)
// ========== DEMO TOKEN CHO HS256 VÀ ES256 ==========

// 1. Tạo token HS256 demo
app.post('/api/demo/token/hs256', async (req, res) => {
  const jose = await import('jose');
  const payload = {
    sub: 'demo-user-hs256',
    preferred_username: 'demouser',
    realm_access: { roles: ['user'] },
    scope: 'read write',
    client_id: 'gateway-client'
  };
  const key = keyStore.getSigningKey('HS256');
  const token = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', kid: key.kid })
    .setIssuer(DEMO_JWT_ISSUER)
    .setAudience(DEMO_JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(key.secret));
  introspectionStore.registerToken(token, jose.decodeJwt(token));
  res.json({ algorithm: 'HS256', kid: key.kid, token: token });
});

app.get('/metrics', (req, res) => {
  res.json(metrics.snapshot());
});

app.get('/metrics/prometheus', (req, res) => {
  res.type('text/plain; version=0.0.4').send(metrics.toPrometheus());
});

app.get('/api/secure-introspection', introspection.introspectToken, (req, res) => {
  res.json({
    message: 'Secure API validated by token introspection',
    user: req.user.preferred_username,
    client_id: req.user.client_id,
    scope: req.user.scope,
  });
});

// 2. Tạo token ES256 demo
app.post('/api/demo/token/es256', async (req, res) => {
  const jose = await import('jose');
  const payload = {
    sub: 'demo-user-es256',
    preferred_username: 'demouser',
    realm_access: { roles: ['user'] },
    scope: 'read write',
    client_id: 'gateway-client'
  };
  const key = keyStore.getSigningKey('ES256');
  const privatePem = key.privateKey || fs.readFileSync(ES256_PRIVATE_KEY_PATH, 'utf8');
  const privateKey = await jose.importPKCS8(privatePem, 'ES256');
  const token = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid: key.kid })
    .setIssuer(DEMO_JWT_ISSUER)
    .setAudience(DEMO_JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
  introspectionStore.registerToken(token, jose.decodeJwt(token));
  res.json({ algorithm: 'ES256', kid: key.kid, token: token });
});

// 3. Test JWT algorithm detection
app.get('/api/crypto/jwt-algorithm', auth.authenticateToken, (req, res) => {
  res.json({
    message: 'JWT validation successful',
    algorithm: req.user.token_algorithm,
    payload: {
      username: req.user.preferred_username,
      roles: req.user.realm_access?.roles || []
    }
  });
});


//==phần thêm HMAC== //

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalRequest(method, pathName, timestamp, nonce, body) {
  const bodyHash = sha256Hex(stableStringify(body || {}));
  return [method.toUpperCase(), pathName, timestamp, nonce, bodyHash].join('\n');
}

function createHmacSignature(method, pathName, timestamp, nonce, body, secret = keyStore.getHmacSecret()) {
  return crypto
    .createHmac('sha256', secret)
    .update(canonicalRequest(method, pathName, timestamp, nonce, body))
    .digest('hex');
}

function timingSafeHexEqual(left, right) {
  if (!/^[0-9a-f]+$/i.test(left || '') || !/^[0-9a-f]+$/i.test(right || '')) {
    return false;
  }
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function pruneExpiredNonces(now = Date.now()) {
  for (const [nonce, expiresAt] of usedNonces.entries()) {
    if (expiresAt <= now) {
      usedNonces.delete(nonce);
    }
  }
}

//  API 1: Tạo chữ ký HMAC (cho client gửi request) NGƯỜI GỬI
app.post('/api/crypto/hmac-sign', (req, res) => {
  const { body, message, method, path: requestPath, timestamp, nonce, secret } = req.body;
  const payload = body || message;
  
  if (!payload) {
    return res.status(400).json({ error: 'missing_message' });
  }

  const signedTimestamp = String(timestamp || Date.now());
  const signedNonce = nonce || crypto.randomUUID();
  const signedMethod = method || 'POST';
  const signedPath = requestPath || '/api/crypto/hmac-verify';
  const signature = createHmacSignature(
    signedMethod,
    signedPath,
    signedTimestamp,
    signedNonce,
    payload,
    secret || keyStore.getHmacSecret()
  );
  
  res.json({
    message: 'HMAC signature created',
    signature: signature,
    algorithm: 'HMAC-SHA256',
    headers: {
      'x-timestamp': signedTimestamp,
      'x-nonce': signedNonce,
      'x-signature': signature
    },
    canonical: canonicalRequest(signedMethod, signedPath, signedTimestamp, signedNonce, payload)
  });
});

app.get('/api/crypto/key-status', (req, res) => {
  res.json(keyStore.getState());
});

app.post('/api/crypto/reload-keys', async (req, res) => {
  const started = process.hrtime.bigint();
  await keyStore.refreshKeys();
  const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
  metrics.inc('vault_reload_total');
  metrics.observe('vault_reload_duration_ms', durationMs);
  auditLog.write('vault_reload', { duration_ms: Number(durationMs.toFixed(3)) });
  res.json({
    reloaded: true,
    state: keyStore.getState(),
  });
});
// API 2: Backend verifies HMAC for M2M requests. Kong only forwards HMAC headers.
app.post('/api/crypto/hmac-verify', auth.authenticateToken, (req, res) => {
  const timestamp = req.headers['x-timestamp'];
  const nonce = req.headers['x-nonce'];
  const signature = req.headers['x-signature'];
  const payload = req.body.body || req.body.message;

  if (!timestamp || !nonce || !signature) {
    return res.status(400).json({
      error: 'missing_signature_headers',
      message: 'Thiếu x-timestamp, x-nonce hoặc x-signature'
    });
  }
  
  // 1. Kiểm tra timestamp (chống replay attack - gửi lại request cũ)
  const requestTime = Number(timestamp);
  const currentTime = Date.now();
  if (!Number.isFinite(requestTime) || Math.abs(currentTime - requestTime) > HMAC_TIMESTAMP_WINDOW_MS) {
    return res.status(401).json({
      error: 'request_expired',
      message: 'Timestamp quá cũ, request đã hết hạn'
    });
  }
  
  // 2. Kiểm tra nonce (chống replay - mỗi request có 1 mã riêng)
  pruneExpiredNonces(currentTime);
  if (usedNonces.has(nonce)) {
    metrics.inc('replay_detected_total');
    auditLog.write('replay_detected', { nonce, path: req.path });
    return res.status(401).json({
      error: 'replay_detected',
      message: 'Nonce đã được sử dụng, nghi ngờ replay attack'
    });
  }
  
  // 3. Verify chữ ký
  if (!payload) {
    return res.status(400).json({
      error: 'missing_data',
      message: 'Thiếu message/body để verify HMAC'
    });
  }
  
  const expectedSignature = createHmacSignature(
    req.method,
    req.path,
    timestamp,
    nonce,
    payload,
    keyStore.getHmacSecret()
  );
  
  if (timingSafeHexEqual(expectedSignature, signature)) {
    usedNonces.set(nonce, currentTime + HMAC_TIMESTAMP_WINDOW_MS);
    res.json({
      success: true,
      message: 'HMAC signature hợp lệ, request không bị sửa đổi',
      verified: true,
      user: req.user.preferred_username || req.user.sub
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'HMAC signature không hợp lệ, request đã bị sửa đổi!',
      verified: false
    });
  }
});

async function startServer() {
  await auth.initializeJWT();

  app.listen(PORT, () => {
    console.log(`Gateway running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start gateway:', error);
  process.exit(1);
});
