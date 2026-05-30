const crypto = require('crypto');
const { readSecret, writeSecret, normalizeKeySecret } = require('./vault-client');

const algorithm = (process.argv[2] || 'HS256').toUpperCase();
const action = (process.argv[3] || 'status').toLowerCase();
const percent = Number(process.argv[4] || process.env.CANARY_PERCENT || 10);
const graceSeconds = Number(process.env.ROTATION_GRACE_SECONDS || 300);

function vaultPath() {
  if (algorithm === 'HS256') {
    return 'secret/jwt/hs256';
  }
  if (algorithm === 'ES256') {
    return 'secret/jwt/es256';
  }
  throw new Error('Usage: node scripts/canary-rotation.js HS256|ES256 start|set|promote|rollback|status [percent]');
}

function newKid() {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${algorithm.toLowerCase()}-canary-${suffix}`;
}

function createKey(now) {
  if (algorithm === 'HS256') {
    return {
      secret: crypto.randomBytes(32).toString('base64url'),
      status: 'active',
      notBefore: now,
      expiresAt: now + 86400,
      createdAt: new Date().toISOString(),
    };
  }

  const pair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    status: 'active',
    notBefore: now,
    expiresAt: now + 86400,
    createdAt: new Date().toISOString(),
  };
}

async function main() {
  const path = vaultPath();
  const now = Math.floor(Date.now() / 1000);
  const data = normalizeKeySecret(await readSecret(path, { keys: {} }));
  data.keys = data.keys || {};

  if (action === 'start') {
    const kid = newKid();
    data.keys[kid] = createKey(now);
    data.canaryKid = kid;
    data.canaryPercent = Math.max(0, Math.min(100, percent));
  } else if (action === 'set') {
    if (!data.canaryKid) {
      throw new Error('No canaryKid exists. Run start first.');
    }
    data.canaryPercent = Math.max(0, Math.min(100, percent));
  } else if (action === 'promote') {
    if (!data.canaryKid || !data.keys[data.canaryKid]) {
      throw new Error('No canary key to promote.');
    }
    if (data.currentKid && data.keys[data.currentKid]) {
      data.keys[data.currentKid].status = 'grace';
      data.keys[data.currentKid].expiresAt = now + graceSeconds;
    }
    data.currentKid = data.canaryKid;
    data.canaryKid = null;
    data.canaryPercent = 0;
  } else if (action === 'rollback') {
    if (data.canaryKid && data.keys[data.canaryKid]) {
      data.keys[data.canaryKid].status = 'revoked';
      data.keys[data.canaryKid].expiresAt = now;
    }
    data.canaryKid = null;
    data.canaryPercent = 0;
  } else if (action !== 'status') {
    throw new Error('Usage: node scripts/canary-rotation.js HS256|ES256 start|set|promote|rollback|status [percent]');
  }

  if (action !== 'status') {
    await writeSecret(path, data);
  }

  console.log(JSON.stringify({
    algorithm,
    action,
    currentKid: data.currentKid,
    canaryKid: data.canaryKid,
    canaryPercent: data.canaryPercent || 0,
    keys: Object.fromEntries(
      Object.entries(data.keys).map(([kid, key]) => [kid, {
        status: key.status,
        notBefore: key.notBefore,
        expiresAt: key.expiresAt,
      }])
    ),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
