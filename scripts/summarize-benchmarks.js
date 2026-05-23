const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'results', 'week9');
if (!fs.existsSync(dir)) {
  console.error(`No benchmark directory found: ${dir}`);
  process.exit(1);
}

const rows = fs.readdirSync(dir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => {
    const result = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    return {
      file,
      name: result.name,
      totalRequests: result.totalRequests,
      requestsPerSec: result.requestsPerSec,
      avg: result.latencyMs.avg,
      p50: result.latencyMs.p50,
      p95: result.latencyMs.p95,
      p99: result.latencyMs.p99,
      max: result.latencyMs.max,
      concurrency: result.concurrency,
      durationSec: result.durationSec,
    };
  });

const csv = [
  'file,name,totalRequests,requestsPerSec,avg,p50,p95,p99,max,concurrency,durationSec',
  ...rows.map((row) => [
    row.file,
    row.name,
    row.totalRequests,
    row.requestsPerSec,
    row.avg,
    row.p50,
    row.p95,
    row.p99,
    row.max,
    row.concurrency,
    row.durationSec,
  ].join(',')),
].join('\n');

const output = path.join(dir, 'summary.csv');
fs.writeFileSync(output, csv);
console.table(rows);
console.log(`Saved ${output}`);
