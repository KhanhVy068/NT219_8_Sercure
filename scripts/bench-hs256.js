const { arg, warmup, runBenchmark, getJson, saveResult } = require('./bench-common');

async function main() {
  const baseUrl = arg('url', process.env.BASE_URL || 'http://localhost:3000');
  const durationSec = Number(arg('duration', 15));
  const concurrency = Number(arg('concurrency', 20));
  const warmupCount = Number(arg('warmup', 20));
  const scenario = arg('scenario', process.env.BENCH_SCENARIO || 'baseline');

  const tokenResponse = await getJson(`${baseUrl}/api/demo/token/hs256`, { method: 'POST' });
  const token = tokenResponse.body.token;
  const headers = { Authorization: `Bearer ${token}` };

  const requestFn = async () => {
    const response = await fetch(`${baseUrl}/api/crypto/jwt-algorithm`, { headers });
    await response.arrayBuffer();
    return response.status;
  };

  await warmup(requestFn, warmupCount);
  const result = await runBenchmark({
    name: 'hs256-local-verify',
    durationSec,
    concurrency,
    requestFn,
    extra: { algorithm: 'HS256', kid: tokenResponse.body.kid, scenario },
  });
  const files = saveResult(result);
  console.log(JSON.stringify({ result, files }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
