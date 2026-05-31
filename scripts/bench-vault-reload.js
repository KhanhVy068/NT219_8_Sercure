const { arg, warmup, runBenchmark, saveResult } = require('./bench-common');

async function main() {
  const baseUrl = arg('url', process.env.BASE_URL || 'http://localhost:3000');
  const durationSec = Number(arg('duration', 10));
  const concurrency = Number(arg('concurrency', 2));
  const warmupCount = Number(arg('warmup', 3));
  const scenario = arg('scenario', process.env.BENCH_SCENARIO || 'baseline');

  const requestFn = async () => {
    const response = await fetch(`${baseUrl}/api/crypto/reload-keys`, { method: 'POST' });
    await response.arrayBuffer();
    return response.status;
  };

  await warmup(requestFn, warmupCount);
  const result = await runBenchmark({
    name: 'vault-key-reload',
    durationSec,
    concurrency,
    requestFn,
    extra: { scenario, warning: 'Do not run high concurrency reload in production' },
  });
  const files = saveResult(result);
  console.log(JSON.stringify({ result, files }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
