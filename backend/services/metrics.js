const counters = new Map();
const histograms = new Map();

function inc(name, labels = {}) {
  const key = labelsKey(name, labels);
  counters.set(key, {
    name,
    labels,
    value: (counters.get(key)?.value || 0) + 1,
  });
}

function observe(name, value, labels = {}) {
  const key = labelsKey(name, labels);
  const current = histograms.get(key) || {
    name,
    labels,
    values: [],
  };
  current.values.push(Number(value));
  if (current.values.length > 10000) {
    current.values.shift();
  }
  histograms.set(key, current);
}

function percentile(sorted, p) {
  if (!sorted.length) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function snapshot() {
  const histogramSnapshot = [...histograms.values()].map((item) => {
    const sorted = [...item.values].sort((a, b) => a - b);
    return {
      name: item.name,
      labels: item.labels,
      count: sorted.length,
      avg: sorted.reduce((sum, value) => sum + value, 0) / (sorted.length || 1),
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      max: sorted.at(-1) || 0,
    };
  });

  return {
    counters: [...counters.values()],
    histograms: histogramSnapshot,
  };
}

function labelsKey(name, labels) {
  return `${name}:${JSON.stringify(labels)}`;
}

module.exports = {
  inc,
  observe,
  snapshot,
};
