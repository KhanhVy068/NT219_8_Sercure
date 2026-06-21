import csv
import os
import sys
from pathlib import Path

try:
    import matplotlib.pyplot as plt
except ImportError:
    print("matplotlib is not installed. Run: python -m pip install matplotlib")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(os.environ.get("BENCH_RESULTS_DIR", ROOT / "results" / "week9")).resolve()
SUMMARY = OUT_DIR / "summary.csv"

if not SUMMARY.exists():
    print(f"Missing {SUMMARY}. Run: node scripts\\summarize-benchmarks.js")
    sys.exit(1)

rows = []
with SUMMARY.open(newline="", encoding="utf-8") as handle:
    reader = csv.DictReader(handle)
    rows = list(reader)

if not rows:
    print("summary.csv has no rows")
    sys.exit(1)

names = [row["name"] for row in rows]
throughput = [float(row["requestsPerSec"]) for row in rows]
p95 = [float(row["p95"]) for row in rows]

plt.figure(figsize=(10, 5))
plt.bar(names, throughput)
plt.ylabel("requests/sec")
plt.title("Throughput Comparison")
plt.xticks(rotation=25, ha="right")
plt.tight_layout()
plt.savefig(OUT_DIR / "throughput-chart.png", dpi=160)

plt.figure(figsize=(10, 5))
plt.bar(names, p95)
plt.ylabel("p95 latency (ms)")
plt.title("Latency p95 Comparison")
plt.xticks(rotation=25, ha="right")
plt.tight_layout()
plt.savefig(OUT_DIR / "latency-p95-chart.png", dpi=160)

print(f"Saved {OUT_DIR / 'throughput-chart.png'}")
print(f"Saved {OUT_DIR / 'latency-p95-chart.png'}")
