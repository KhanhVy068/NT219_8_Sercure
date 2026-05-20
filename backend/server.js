const express = require('express');
const auth = require('./middleware/auth');
const fs = require('fs');
const ES256_PRIVATE_KEY = fs.readFileSync('./es256-private.pem', 'utf8');
console.log(auth);
console.log("AUTH:", auth);
console.log("authenticateToken:", typeof auth.authenticateToken);
console.log("requireRealmRole:", typeof auth.requireRealmRole);
console.log("CALL RESULT:", typeof auth.requireRealmRole?.('admin'));
const cors = require('cors');
const helmet = require('helmet');


const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
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
app.post('/api/demo/token/hs256', (req, res) => {
  const jwt = require('jsonwebtoken');
  const secret = 'khóa-bi-mật-24byte-cho-hs256!!';
  const payload = {
    sub: 'demo-user-hs256',
    preferred_username: 'demouser',
    realm_access: { roles: ['user'] }
  };
  const token = jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '1h' });
  res.json({ algorithm: 'HS256', token: token });
});

// 2. Tạo token ES256 demo
app.post('/api/demo/token/es256', (req, res) => {
 const jwt = require('jsonwebtoken');
  const payload = {
    sub: 'demo-user-es256',
    preferred_username: 'demouser',
    realm_access: { roles: ['user'] }
  };
  const token = jwt.sign(payload, ES256_PRIVATE_KEY, { algorithm: 'ES256', expiresIn: '1h' });
  res.json({ algorithm: 'ES256', token: token });
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

//  API 1: Tạo chữ ký HMAC (cho client gửi request) NGƯỜI GỬI
app.post('/api/crypto/hmac-sign', (req, res) => {
  const { message, secret } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'missing_message' });
  }
  
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', secret || 'default-secret-key');
  hmac.update(JSON.stringify(message));
  const signature = hmac.digest('hex');
  
  res.json({
    message: 'HMAC signature created',
    signature: signature,
    algorithm: 'HMAC-SHA256'
  });
});
// API 2: Verify chữ ký HMAC (gateway kiểm tra) NGƯỜI NHẬN
// Verify HMAC signature (gateway kiểm tra request có bị sửa không)
app.post('/api/crypto/hmac-verify', (req, res) => {
  const { message, signature } = req.body;
  const timestamp = req.headers['x-timestamp'];
  const nonce = req.headers['x-nonce'];
  
  // 1. Kiểm tra timestamp (chống replay attack - gửi lại request cũ)
  if (timestamp) {
    const requestTime = parseInt(timestamp);
    const currentTime = Date.now();
    if (Math.abs(currentTime - requestTime) > 60000) { // 60 giây
      return res.status(401).json({
        error: 'request_expired',
        message: 'Timestamp quá cũ, request đã hết hạn'
      });
    }
  }
  
  // 2. Kiểm tra nonce (chống replay - mỗi request có 1 mã riêng)
  if (nonce) {
    // Trong thực tế, cần lưu nonce đã dùng vào Redis để kiểm tra
    console.log(`Nonce received: ${nonce}`);
  }
  
  // 3. Verify chữ ký
  if (!message || !signature) {
    return res.status(400).json({
      error: 'missing_data',
      message: 'Thiếu message hoặc signature'
    });
  }
  
  const crypto = require('crypto');
  const secret = req.headers['x-secret'] || 'default-secret-key';
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(message));
  const expectedSignature = hmac.digest('hex');
  
  if (expectedSignature === signature) {
    res.json({
      success: true,
      message: 'HMAC signature hợp lệ, request không bị sửa đổi',
      verified: true
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

  app.listen(3000, () => {
    console.log('Gateway running on port 3000');
  });
}

startServer().catch((error) => {
  console.error('Failed to start gateway:', error);
  process.exit(1);
});