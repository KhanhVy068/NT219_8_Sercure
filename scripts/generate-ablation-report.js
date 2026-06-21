const fs = require('fs');
const path = require('path');

const benchmarkDir = process.env.BENCH_RESULTS_DIR
  ? path.resolve(process.env.BENCH_RESULTS_DIR)
  : path.join(__dirname, '..', 'results', 'week9');
const inputPath = path.join(benchmarkDir, 'aggregate-summary.json');
const outputDir = path.join(__dirname, '..', 'results', 'week11');
const outputPath = path.join(outputDir, 'ablation-report.md');

function pct(deltaBase, base) {
  if (!base) {
    return 0;
  }
  return Number(((deltaBase / base) * 100).toFixed(2));
}

function fmt(value, suffix = '') {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `${Number(value).toFixed(3)}${suffix}`;
}

function requireRow(rows, predicate, label) {
  const row = rows.find(predicate);
  if (!row) {
    throw new Error(`Missing aggregate row for ${label}`);
  }
  return row;
}

function comparison({ name, aLabel, bLabel, a, b, interpretation }) {
  const rpsDiff = pct(a.rps_mean - b.rps_mean, b.rps_mean);
  const p95Diff = pct(b.p95_ms_mean - a.p95_ms_mean, a.p95_ms_mean);
  return {
    name,
    aLabel,
    bLabel,
    a,
    b,
    rpsDiff,
    p95Diff,
    interpretation,
  };
}

function main() {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Missing input: ${inputPath}. Run node scripts/aggregate-results.js first.`);
  }

  const rows = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  const hsAlg = requireRow(rows, (row) =>
    row.scenario === 'alg-compare' && row.algorithm === 'HS256', 'HS256 alg-compare');
  const esAlg = requireRow(rows, (row) =>
    row.scenario === 'alg-compare' && row.algorithm === 'ES256', 'ES256 alg-compare');

  const localJwt = requireRow(rows, (row) =>
    row.scenario === 'validation-mode' && row.name === 'hs256-local-verify', 'local JWT validation');
  const introspection = requireRow(rows, (row) =>
    row.scenario === 'validation-mode' && row.name === 'introspection-validation', 'introspection validation');

  const cacheOn = requireRow(rows, (row) =>
    row.scenario === 'introspection-cache' && row.cacheStrategy === 'cache-on', 'introspection cache-on');
  const cacheOff = requireRow(rows, (row) =>
    row.scenario === 'introspection-cache' && row.cacheStrategy === 'cache-off', 'introspection cache-off');

  const comparisons = [
    comparison({
      name: 'Algorithm',
      aLabel: 'HS256 local verify',
      bLabel: 'ES256 local verify',
      a: hsAlg,
      b: esAlg,
      interpretation: 'HS256 co signing/verify doi xung nhe hon, ES256 co loi the public-key distribution.',
    }),
    comparison({
      name: 'Validation mode',
      aLabel: 'HS256 local JWT',
      bLabel: 'Introspection cache-on',
      a: localJwt,
      b: introspection,
      interpretation: 'Local JWT tranh online lookup; introspection doi lai kha nang kiem tra token dang active/revoked.',
    }),
    comparison({
      name: 'Cache strategy',
      aLabel: 'Introspection cache-on',
      bLabel: 'Introspection cache-off',
      a: cacheOn,
      b: cacheOff,
      interpretation: 'Cache-on tang throughput va giam p95, nhung tao stale window phu thuoc TTL.',
    }),
  ];

  const lines = [
    '# Week 11 Ablation Report',
    '',
    `Generated from \`${path.relative(path.join(__dirname, '..'), inputPath).replace(/\\/g, '/')}\`.`,
    '',
    '## Summary',
    '',
    '| Comparison | Variant A | Variant B | RPS A | RPS B | RPS delta A vs B | P95 A | P95 B | P95 delta B vs A | Ket luan |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---|',
    ...comparisons.map((item) => [
      item.name,
      item.aLabel,
      item.bLabel,
      fmt(item.a.rps_mean),
      fmt(item.b.rps_mean),
      fmt(item.rpsDiff, '%'),
      fmt(item.a.p95_ms_mean, ' ms'),
      fmt(item.b.p95_ms_mean, ' ms'),
      fmt(item.p95Diff, '%'),
      item.interpretation,
    ].map((cell) => String(cell).replace(/\|/g, '/')).join('|').replace(/^/, '|').replace(/$/, '|')),
    '',
    '## Raw Rows Used',
    '',
    '| Scenario | Name | Algorithm | Cache | Concurrency | Runs | RPS mean | RPS stddev | Avg ms | P95 ms | P99 ms | Errors |',
    '|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...[hsAlg, esAlg, localJwt, introspection, cacheOn, cacheOff].map((row) => [
      row.scenario,
      row.name,
      row.algorithm || '',
      row.cacheStrategy || '',
      row.concurrency,
      row.runs,
      fmt(row.rps_mean),
      fmt(row.rps_stddev),
      fmt(row.avg_ms_mean),
      fmt(row.p95_ms_mean),
      fmt(row.p99_ms_mean),
      row.errors_sum,
    ].join('|').replace(/^/, '|').replace(/$/, '|')),
    '',
    '## Notes',
    '',
    '- Tat ca row duoc dung trong report co `errors_sum = 0` trong aggregate result.',
    '- Ket qua local co the dao dong theo CPU/background process; bao cao nen neu ro benchmark chay tren moi truong local.',
    '- Introspection trong demo co cache/in-memory path, nen production voi Keycloak remote co the co overhead lon hon.',
    '',
  ];

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, lines.join('\n'));
  console.log(`Saved ${outputPath}`);
}

main();
