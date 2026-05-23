const crypto = require('crypto');

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function tamperJwtPayload(token) {
  const [header, payload, signature] = token.split('.');
  const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  body.preferred_username = 'attacker';
  body.realm_access = { roles: ['admin'] };
  return `${header}.${base64urlJson(body)}.${signature}`;
}

function algNoneToken(token) {
  const [, payload] = token.split('.');
  return `${base64urlJson({ alg: 'none', typ: 'JWT' })}.${payload}.`;
}

function fakeSignature(token) {
  const parts = token.split('.');
  parts[2] = `${parts[2].slice(0, -1)}${parts[2].endsWith('a') ? 'b' : 'a'}`;
  return parts.join('.');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function hmacHeaders(body, secret) {
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const bodyHash = crypto.createHash('sha256').update(stableStringify(body)).digest('hex');
  const canonical = ['POST', '/api/crypto/hmac-verify', timestamp, nonce, bodyHash].join('\n');
  const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
  return { timestamp, nonce, signature };
}

async function callJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw body.
  }
  return { status: response.status, body };
}

async function expectBlocked(name, fn) {
  const result = await fn();
  const pass = result.status >= 400;
  return { name, pass, status: result.status, body: result.body };
}

async function main() {
  const baseUrl = arg('url', process.env.BASE_URL || 'http://localhost:3000');
  const hmacSecret = process.env.HMAC_SECRET || 'demo-hmac-secret-32bytes-minimum';
  const tokenResponse = await callJson(`${baseUrl}/api/demo/token/hs256`, { method: 'POST' });
  const token = tokenResponse.body.token;

  const attacks = [];

  attacks.push(await expectBlocked('jwt_fake_signature', () =>
    callJson(`${baseUrl}/api/crypto/jwt-algorithm`, {
      headers: { Authorization: `Bearer ${fakeSignature(token)}` },
    })
  ));

  attacks.push(await expectBlocked('jwt_modified_payload_admin_role', () =>
    callJson(`${baseUrl}/api/crypto/jwt-algorithm`, {
      headers: { Authorization: `Bearer ${tamperJwtPayload(token)}` },
    })
  ));

  attacks.push(await expectBlocked('jwt_alg_none', () =>
    callJson(`${baseUrl}/api/crypto/jwt-algorithm`, {
      headers: { Authorization: `Bearer ${algNoneToken(token)}` },
    })
  ));

  const body = { amount: 100000, to: 'alice' };
  const signed = hmacHeaders(body, hmacSecret);
  const hmacHeadersBase = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-timestamp': signed.timestamp,
    'x-nonce': signed.nonce,
    'x-signature': signed.signature,
  };
  await callJson(`${baseUrl}/api/crypto/hmac-verify`, {
    method: 'POST',
    headers: hmacHeadersBase,
    body: JSON.stringify({ body }),
  });
  attacks.push(await expectBlocked('hmac_replay_nonce', () =>
    callJson(`${baseUrl}/api/crypto/hmac-verify`, {
      method: 'POST',
      headers: hmacHeadersBase,
      body: JSON.stringify({ body }),
    })
  ));

  await callJson(`${baseUrl}/oauth/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  attacks.push(await expectBlocked('revoked_token_reuse', () =>
    callJson(`${baseUrl}/api/crypto/jwt-algorithm`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ));

  console.table(attacks.map((attack) => ({
    name: attack.name,
    pass: attack.pass,
    status: attack.status,
  })));
  console.log(JSON.stringify(attacks, null, 2));

  if (attacks.some((attack) => !attack.pass)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
