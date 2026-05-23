const crypto = require('crypto');

const revokedTokens = new Map();

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function revokeToken(token, exp, type = 'access_token') {
  const tokenHash = hashToken(token);
  revokedTokens.set(tokenHash, {
    tokenHash,
    type,
    exp: Number(exp || Math.floor(Date.now() / 1000) + 3600),
    revokedAt: new Date().toISOString(),
  });
  return tokenHash;
}

function isRevoked(token) {
  cleanupExpired();
  return revokedTokens.has(hashToken(token));
}

function cleanupExpired(now = Math.floor(Date.now() / 1000)) {
  for (const [tokenHash, record] of revokedTokens.entries()) {
    if (record.exp <= now) {
      revokedTokens.delete(tokenHash);
    }
  }
}

function listRevoked() {
  cleanupExpired();
  return [...revokedTokens.values()];
}

module.exports = {
  revokeToken,
  isRevoked,
  cleanupExpired,
  listRevoked,
  hashToken,
};
