const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeSecret } = require('./vault-client');

const now = Math.floor(Date.now() / 1000);
const esPrivatePath = path.join(__dirname, '..', 'backend', 'es256-private.pem');
const esPublicPath = path.join(__dirname, '..', 'backend', 'es256-public.pem');

function ensureEs256Keys() {
  if (fs.existsSync(esPrivatePath) && fs.existsSync(esPublicPath)) {
    return {
      privateKey: fs.readFileSync(esPrivatePath, 'utf8'),
      publicKey: fs.readFileSync(esPublicPath, 'utf8'),
    };
  }

  const pair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  fs.writeFileSync(esPrivatePath, pair.privateKey);
  fs.writeFileSync(esPublicPath, pair.publicKey);
  return pair;
}

async function main() {
  const es256 = ensureEs256Keys();

  await writeSecret('secret/jwt/hs256', {
    currentKid: 'hs256-v1',
    keys: {
      'hs256-v1': {
        secret: process.env.HS256_SECRET || 'khoa-bi-mat-24byte-cho-hs256!!',
        status: 'active',
        notBefore: now,
        expiresAt: now + 86400,
        createdAt: new Date().toISOString(),
      },
    },
  });

  await writeSecret('secret/hmac/api', {
    currentKid: 'hmac-v1',
    secret: process.env.HMAC_SECRET || 'demo-hmac-secret-32bytes-minimum',
    createdAt: new Date().toISOString(),
  });

  await writeSecret('secret/jwt/es256', {
    currentKid: 'es256-v1',
    keys: {
      'es256-v1': {
        privateKey: es256.privateKey,
        publicKey: es256.publicKey,
        status: 'active',
        notBefore: now,
        expiresAt: now + 86400,
        createdAt: new Date().toISOString(),
      },
    },
  });

  console.log('Vault demo secrets initialized:');
  console.log('- secret/jwt/hs256 currentKid=hs256-v1');
  console.log('- secret/hmac/api currentKid=hmac-v1');
  console.log('- secret/jwt/es256 currentKid=es256-v1');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
