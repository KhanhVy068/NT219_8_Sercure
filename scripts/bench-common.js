const fs = require('fs');
const path = require('path');

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function percentile(sorted, p) {
  if (!sorted.length) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function summarize(name, latencies, statusCounts, startedAt, endedAt, extra = {}) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const durationSec = (endedAt - startedAt) / 1000;
  const total = latencies.length;
  return {
    name,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    durationSec: Number(durationSec.toFixed(3)),
    totalRequests: total,
    requestsPerSec: Number((total / durationSec).toFixed(2)),
    latencyMs: {
      avg: Number((sorted.reduce((sum, value) => sum + value, 0) / (total || 1)).toFixed(3)),
      min: Number((sorted[0] || 0).toFixed(3)),
      p50: Number(percentile(sorted, 50).toFixed(3)),
      p95: Number(percentile(sorted, 95).toFixed(3)),
      p99: Number(percentile(sorted, 99).toFixed(3)),
      max: Number((sorted.at(-1) || 0).toFixed(3)),
    },
    statusCounts,
    ...extra,
  };
}

async function warmup(fn, count = 20) {
  for (let i = 0; i < count; i += 1) {
    await fn();
  }
}

async function runBenchmark({ name, durationSec, concurrency, requestFn, extra }) {
  const latencies = [];
  const statusCounts = {};
  const startedAt = Date.now();
  const endAt = startedAt + durationSec * 1000;

  async function worker() {
    while (Date.now() < endAt) {
      const start = process.hrtime.bigint();
      try {
        const status = await requestFn();
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      } catch (error) {
        statusCounts.error = (statusCounts.error || 0) + 1;
      } finally {
        const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
        latencies.push(elapsedMs);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return summarize(name, latencies, statusCounts, startedAt, Date.now(), {
    concurrency,
    ...extra,
  });
}

async function getJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

function saveResult(result) {
  const outDir = process.env.BENCH_RESULTS_DIR
    ? path.resolve(process.env.BENCH_RESULTS_DIR)
    : path.join(__dirname, '..', 'results', 'week9');
  fs.mkdirSync(outDir, { recursive: true });
  const safeName = result.name.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const jsonPath = path.join(outDir, `${timestamp}-${safeName}.json`);
  const csvPath = path.join(outDir, `${timestamp}-${safeName}.csv`);
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  fs.writeFileSync(csvPath, [
    'name,totalRequests,requestsPerSec,avg,p50,p95,p99,max,concurrency,durationSec',
    [
      result.name,
      result.totalRequests,
      result.requestsPerSec,
      result.latencyMs.avg,
      result.latencyMs.p50,
      result.latencyMs.p95,
      result.latencyMs.p99,
      result.latencyMs.max,
      result.concurrency,
      result.durationSec,
    ].join(','),
  ].join('\n'));
  return { jsonPath, csvPath };
}

function benchmarkHeaders(extra = {}) {
  return {
    'x-gateway-token': process.env.BENCH_GATEWAY_TOKEN || 'demo-gateway-internal-token',
    'x-gateway-identity': 'benchmark-runner',
    ...extra,
  };
}

function assertExpectedStatuses(result, expected = [200]) {
  const unexpected = Object.entries(result.statusCounts || {})
    .filter(([status, count]) => count > 0 && !expected.includes(Number(status)));

  if (unexpected.length) {
    const summary = unexpected.map(([status, count]) => `${status}=${count}`).join(', ');
    throw new Error(
      `Benchmark ${result.name} is invalid: unexpected responses (${summary}). ` +
      'Fix authentication/rate limiting before using this result.'
    );
  }
}

function assertResponse(response, label, expected = [200]) {
  if (!expected.includes(response.status)) {
    throw new Error(
      `${label} preflight failed with HTTP ${response.status}: ${JSON.stringify(response.body)}`
    );
  }
}

module.exports = {
  arg,
  warmup,
  runBenchmark,
  getJson,
  saveResult,
  benchmarkHeaders,
  assertExpectedStatuses,
  assertResponse,
};
