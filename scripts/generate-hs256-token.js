const path = require('path');
const { pathToFileURL } = require('url');
const { createRequire } = require('module');

global.crypto = require('crypto').webcrypto;

const secret = process.env.HS256_SECRET || 'khoa-bi-mat-24byte-cho-hs256!!';
const issuer = process.env.DEMO_JWT_ISSUER || 'http://localhost:3000/demo-idp';
const audience = process.env.DEMO_JWT_AUDIENCE || 'secure-api';
const kid = process.env.HS256_KID || 'demo-hs256-key-1';

const args = new Set(process.argv.slice(2));
const useBadSecret = args.has('--bad-secret');
const expired = args.has('--expired');
const badIssuer = args.has('--bad-issuer');
const badAudience = args.has('--bad-audience');
const badKid = args.has('--bad-kid');

async function main() {
  const backendRequire = createRequire(path.join(__dirname, '..', 'backend', 'package.json'));
  const jose = await import(pathToFileURL(backendRequire.resolve('jose')).href);
  const payload = {
    sub: 'demo-user-hs256',
    preferred_username: 'demouser-hs256',
    realm_access: { roles: ['user'] }
  };

  const token = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', kid: badKid ? 'wrong-hs256-kid' : kid })
    .setIssuer(badIssuer ? 'http://wrong-issuer.example' : issuer)
    .setAudience(badAudience ? 'wrong-audience' : audience)
    .setIssuedAt()
    .setExpirationTime(expired ? Math.floor(Date.now() / 1000) - 10 : '1h')
    .sign(new TextEncoder().encode(useBadSecret ? 'wrong-hs256-secret' : secret));

  console.log(token);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
