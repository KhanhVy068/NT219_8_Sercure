const crypto = require('crypto');
const { arg, warmup, runBenchmark, getJson, saveResult } = require('./bench-common');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function signRequest(body, secret) {
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const bodyHash = sha256Hex(stableStringify(body));
  const canonical = ['POST', '/api/crypto/hmac-verify', timestamp, nonce, bodyHash].join('\n');
  const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
  return { timestamp, nonce, signature };
}

async function main() {
  const baseUrl = arg('url', process.env.BASE_URL || 'http://localhost:3000');
  const durationSec = Number(arg('duration', 15));
  const concurrency = Number(arg('concurrency', 20));
  const warmupCount = Number(arg('warmup', 20));
  const secret = process.env.HMAC_SECRET || 'demo-hmac-secret-32bytes-minimum';

  const tokenResponse = await getJson(`${baseUrl}/api/demo/token/hs256`, { method: 'POST' });
  const token = tokenResponse.body.token;
  const payload = { amount: 100000, to: 'alice' };

  const requestFn = async () => {
    const signed = signRequest(payload, secret);
    const response = await fetch(`${baseUrl}/api/crypto/hmac-verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-timestamp': signed.timestamp,
        'x-nonce': signed.nonce,
        'x-signature': signed.signature,
      },
      body: JSON.stringify({ body: payload }),
    });
    await response.arrayBuffer();
    return response.status;
  };

  await warmup(requestFn, warmupCount);
  const result = await runBenchmark({
    name: 'hmac-request-verification',
    durationSec,
    concurrency,
    requestFn,
    extra: { includesJwtVerify: true },
  });
  const files = saveResult(result);
  console.log(JSON.stringify({ result, files }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
