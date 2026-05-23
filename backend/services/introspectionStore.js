const crypto = require('crypto');
const revocationStore = require('./revocationStore');

const tokenDb = new Map();

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function registerToken(token, claims) {
  tokenDb.set(tokenHash(token), {
    active: true,
    scope: claims.scope || 'read write',
    client_id: claims.client_id || claims.azp || 'gateway-client',
    sub: claims.sub || 'demo-user',
    exp: Number(claims.exp || Math.floor(Date.now() / 1000) + 3600),
    iss: claims.iss,
    aud: claims.aud,
    username: claims.preferred_username,
  });
}

function introspect(token) {
  const record = tokenDb.get(tokenHash(token));
  const now = Math.floor(Date.now() / 1000);

  if (!record || revocationStore.isRevoked(token) || record.exp <= now) {
    return { active: false };
  }

  return {
    active: true,
    scope: record.scope,
    client_id: record.client_id,
    sub: record.sub,
    exp: record.exp,
    iss: record.iss,
    aud: record.aud,
    username: record.username,
  };
}

function deactivate(token) {
  const record = tokenDb.get(tokenHash(token));
  if (record) {
    record.active = false;
    record.exp = 0;
  }
}

module.exports = {
  registerToken,
  introspect,
  deactivate,
};
