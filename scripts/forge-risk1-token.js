global.crypto = require('crypto').webcrypto;

async function main() {
  const jose = await import('../backend/node_modules/jose/dist/webapi/index.js');
  const secret = new TextEncoder().encode(process.env.FORGE_SECRET);
  const token = await new jose.SignJWT({
    sub: 'attacker-001',
    preferred_username: 'attacker',
    realm_access: { roles: ['admin'] },
    scope: 'read write admin',
    client_id: 'gateway-client',
  })
    .setProtectedHeader({ alg: 'HS256', kid: process.env.FORGE_KID })
    .setIssuer(process.env.FORGE_ISSUER)
    .setAudience('secure-api')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret);

  console.log(token);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
