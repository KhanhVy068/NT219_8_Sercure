const { readSecret, writeSecret, normalizeKeySecret } = require('./vault-client');

function getArg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

async function main() {
  const algorithm = (getArg('alg') || 'HS256').toUpperCase();
  const kid = getArg('kid');
  const path = algorithm === 'ES256' ? 'secret/jwt/es256' : 'secret/jwt/hs256';

  if (!kid) {
    throw new Error('Usage: node scripts\\revoke-jwt-kid.js --alg=HS256 --kid=hs256-v1');
  }

  const data = normalizeKeySecret(await readSecret(path, { keys: {} }));
  if (!data.keys?.[kid]) {
    throw new Error(`kid not found: ${kid}`);
  }

  data.keys[kid].status = 'revoked';
  data.keys[kid].expiresAt = Math.floor(Date.now() / 1000);
  await writeSecret(path, data);

  console.log(JSON.stringify({
    revoked: true,
    algorithm,
    kid,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
