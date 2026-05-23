const crypto = require('crypto');
const { readSecret, writeSecret, normalizeKeySecret } = require('./vault-client');

const GRACE_SECONDS = Number(process.env.ROTATION_GRACE_SECONDS || 300);

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const data = normalizeKeySecret(await readSecret('secret/jwt/hs256', { keys: {} }));
  const currentKid = data.currentKid;
  const keys = data.keys || {};

  if (currentKid && keys[currentKid]) {
    keys[currentKid].status = 'grace';
    keys[currentKid].expiresAt = now + GRACE_SECONDS;
  }

  const newKid = `hs256-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  keys[newKid] = {
    secret: crypto.randomBytes(32).toString('base64url'),
    status: 'active',
    notBefore: now,
    expiresAt: now + 86400,
    createdAt: new Date().toISOString(),
  };

  await writeSecret('secret/jwt/hs256', {
    currentKid: newKid,
    keys,
  });

  console.log(JSON.stringify({
    rotated: true,
    algorithm: 'HS256',
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
