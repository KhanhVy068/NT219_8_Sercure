const {
  arg, warmup, runBenchmark, getJson, saveResult, benchmarkHeaders, assertExpectedStatuses, assertResponse,
} = require('./bench-common');

async function main() {
  const baseUrl = arg('url', process.env.BASE_URL || 'http://localhost:3000');
  const durationSec = Number(arg('duration', 15));
  const concurrency = Number(arg('concurrency', 20));
  const warmupCount = Number(arg('warmup', 20));
  const scenario = arg('scenario', process.env.BENCH_SCENARIO || 'baseline');

  const tokenResponse = await getJson(`${baseUrl}/api/demo/token/es256`, {
    method: 'POST',
    headers: benchmarkHeaders(),
  });
  assertResponse(tokenResponse, 'ES256 token creation');
  const token = tokenResponse.body.token;
  const headers = benchmarkHeaders({ Authorization: `Bearer ${token}` });

  const requestFn = async () => {
    const response = await fetch(`${baseUrl}/api/crypto/jwt-algorithm`, { headers });
    await response.arrayBuffer();
    return response.status;
  };
  assertResponse(await getJson(`${baseUrl}/api/crypto/jwt-algorithm`, { headers }), 'ES256 verify');

  await warmup(requestFn, warmupCount);
  const result = await runBenchmark({
    name: 'es256-local-verify',
    durationSec,
    concurrency,
    requestFn,
    extra: { algorithm: 'ES256', kid: tokenResponse.body.kid, scenario },
  });
  assertExpectedStatuses(result);
  const files = saveResult(result);
  console.log(JSON.stringify({ result, files }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
