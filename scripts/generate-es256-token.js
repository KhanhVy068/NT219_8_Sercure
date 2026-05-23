const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { createRequire } = require('module');

global.crypto = crypto.webcrypto;

const issuer = process.env.DEMO_JWT_ISSUER || 'http://localhost:3000/demo-idp';
const audience = process.env.DEMO_JWT_AUDIENCE || 'secure-api';
const kid = process.env.ES256_KID || 'demo-es256-key-1';
const privateKeyPath =
  process.env.ES256_PRIVATE_KEY_PATH || path.join(__dirname, '..', 'backend', 'es256-private.pem');

const args = new Set(process.argv.slice(2));
const expired = args.has('--expired');
const badIssuer = args.has('--bad-issuer');
const badAudience = args.has('--bad-audience');
const badKid = args.has('--bad-kid');
const wrongKey = args.has('--wrong-key');

async function main() {
  const backendRequire = createRequire(path.join(__dirname, '..', 'backend', 'package.json'));
  const jose = await import(pathToFileURL(backendRequire.resolve('jose')).href);

  let privateKeyPem;
  if (wrongKey) {
    privateKeyPem = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' }
    }).privateKey;
  } else {
    privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
  }

  const privateKey = await jose.importPKCS8(privateKeyPem, 'ES256');
  const payload = {
    sub: 'demo-user-es256',
    preferred_username: 'demouser-es256',
    realm_access: { roles: ['user'] }
  };

  const token = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid: badKid ? 'wrong-es256-kid' : kid })
    .setIssuer(badIssuer ? 'http://wrong-issuer.example' : issuer)
    .setAudience(badAudience ? 'wrong-audience' : audience)
    .setIssuedAt()
    .setExpirationTime(expired ? Math.floor(Date.now() / 1000) - 10 : '1h')
    .sign(privateKey);

  console.log(token);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
