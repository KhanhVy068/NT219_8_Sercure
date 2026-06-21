const fs = require('fs');
const path = require('path');

const RESULTS_DIR = process.env.BENCH_RESULTS_DIR
  ? path.resolve(process.env.BENCH_RESULTS_DIR)
  : path.join(__dirname, '..', 'results', 'week9');
const OUTPUT_CSV = path.join(RESULTS_DIR, 'aggregate-summary.csv');
const OUTPUT_JSON = path.join(RESULTS_DIR, 'aggregate-summary.json');

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
}

function stddev(values) {
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function round(value) {
  return Number(value.toFixed(3));
}

function readResults() {
  if (!fs.existsSync(RESULTS_DIR)) {
    throw new Error(`Missing results directory: ${RESULTS_DIR}`);
  }

  return fs.readdirSync(RESULTS_DIR)
    .filter((file) => file.endsWith('.json') && file !== 'aggregate-summary.json')
    .map((file) => {
      const data = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), 'utf8'));
      return {
        file,
        name: data.name,
        scenario: data.scenario || 'baseline',
        algorithm: data.algorithm || '',
        cacheStrategy: data.cacheStrategy || '',
        concurrency: number(data.concurrency),
        durationSec: number(data.durationSec),
        requestsPerSec: number(data.requestsPerSec),
        avg: number(data.latencyMs?.avg),
        p50: number(data.latencyMs?.p50),
        p95: number(data.latencyMs?.p95),
        p99: number(data.latencyMs?.p99),
        max: number(data.latencyMs?.max),
        totalRequests: number(data.totalRequests),
        status200: number(data.statusCounts?.['200']),
        errors: Object.entries(data.statusCounts || {}).reduce((sum, [status, count]) =>
          status === '200' ? sum : sum + number(count), 0),
      };
    });
}

function groupKey(row) {
  return [
    row.name,
    row.scenario,
    row.algorithm,
    row.cacheStrategy,
    row.concurrency,
  ].join('|');
}

function aggregate(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = groupKey(row);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
  }

  return [...groups.values()].map((items) => {
    const first = items[0];
    return {
      name: first.name,
      scenario: first.scenario,
      algorithm: first.algorithm,
      cacheStrategy: first.cacheStrategy,
      concurrency: first.concurrency,
      runs: items.length,
      rps_mean: round(mean(items.map((item) => item.requestsPerSec))),
      rps_stddev: round(stddev(items.map((item) => item.requestsPerSec))),
      avg_ms_mean: round(mean(items.map((item) => item.avg))),
      p50_ms_mean: round(mean(items.map((item) => item.p50))),
      p95_ms_mean: round(mean(items.map((item) => item.p95))),
      p99_ms_mean: round(mean(items.map((item) => item.p99))),
      max_ms_mean: round(mean(items.map((item) => item.max))),
      total_requests_sum: items.reduce((sum, item) => sum + item.totalRequests, 0),
      errors_sum: items.reduce((sum, item) => sum + item.errors, 0),
      files: items.map((item) => item.file).join(';'),
    };
  }).sort((a, b) =>
    a.scenario.localeCompare(b.scenario) ||
    a.name.localeCompare(b.name) ||
    a.concurrency - b.concurrency
  );
}

function toCsv(rows) {
  const headers = [
    'name',
    'scenario',
    'algorithm',
    'cacheStrategy',
    'concurrency',
    'runs',
    'rps_mean',
    'rps_stddev',
    'avg_ms_mean',
    'p50_ms_mean',
    'p95_ms_mean',
    'p99_ms_mean',
    'max_ms_mean',
    'total_requests_sum',
    'errors_sum',
    'files',
  ];
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => JSON.stringify(row[header] ?? '')).join(',')),
  ].join('\n');
}

function main() {
  const rows = readResults();
  const aggregated = aggregate(rows);
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(aggregated, null, 2));
  fs.writeFileSync(OUTPUT_CSV, toCsv(aggregated));
  console.table(aggregated.map((row) => ({
    name: row.name,
    scenario: row.scenario,
    alg: row.algorithm,
    cache: row.cacheStrategy,
    c: row.concurrency,
    runs: row.runs,
    rps: row.rps_mean,
    p95: row.p95_ms_mean,
    errors: row.errors_sum,
  })));
  console.log(`Saved ${OUTPUT_CSV}`);
  console.log(`Saved ${OUTPUT_JSON}`);
}

main();
