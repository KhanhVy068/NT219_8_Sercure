const { arg, warmup, runBenchmark, getJson, saveResult } = require('./bench-common');

async function main() {
  const baseUrl = arg('url', process.env.BASE_URL || 'http://localhost:3000');
  const durationSec = Number(arg('duration', 15));
  const concurrency = Number(arg('concurrency', 20));
  const warmupCount = Number(arg('warmup', 20));
  const scenario = arg('scenario', process.env.BENCH_SCENARIO || 'baseline');
  const cacheStrategy = arg(
    'cache',
    Number(process.env.INTROSPECTION_CACHE_TTL_MS || 5000) > 0 ? 'cache-on' : 'cache-off'
  );

  const tokenResponse = await getJson(`${baseUrl}/api/demo/token/hs256`, { method: 'POST' });
  const token = tokenResponse.body.token;
  const headers = { Authorization: `Bearer ${token}` };

  const requestFn = async () => {
    const response = await fetch(`${baseUrl}/api/secure-introspection`, { headers });
    await response.arrayBuffer();
    return response.status;
  };

  await warmup(requestFn, warmupCount);
  const result = await runBenchmark({
    name: 'introspection-validation',
    durationSec,
    concurrency,
    requestFn,
    extra: {
      scenario,
      cacheStrategy,
      cacheTtlMs: process.env.INTROSPECTION_CACHE_TTL_MS || '5000',
    },
  });
  const files = saveResult(result);
  console.log(JSON.stringify({ result, files }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
