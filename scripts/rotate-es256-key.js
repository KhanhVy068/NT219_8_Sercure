const crypto = require('crypto');
const { readSecret, writeSecret, normalizeKeySecret } = require('./vault-client');

const GRACE_SECONDS = Number(process.env.ROTATION_GRACE_SECONDS || 300);

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const data = normalizeKeySecret(await readSecret('secret/jwt/es256', { keys: {} }));
  const currentKid = data.currentKid;
  const keys = data.keys || {};

  if (currentKid && keys[currentKid]) {
    keys[currentKid].status = 'grace';
    keys[currentKid].expiresAt = now + GRACE_SECONDS;
  }

  const pair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const newKid = `es256-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  keys[newKid] = {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    status: 'active',
    notBefore: now,
    expiresAt: now + 86400,
    createdAt: new Date().toISOString(),
  };

  await writeSecret('secret/jwt/es256', {
    currentKid: newKid,
    keys,
  });

  console.log(JSON.stringify({
    rotated: true,
    algorithm: 'ES256',
    oldKid: currentKid,
    oldKidStatus: currentKid ? 'grace' : null,
    graceSeconds: GRACE_SECONDS,
    newKid,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
