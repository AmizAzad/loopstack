---
name: performance
description: Measure, locate and fix performance problems; load test and plan capacity.
---
# /performance
1. Target: requirement/SLO (p50/p95/p99 latency, throughput, memory, cost). None → ask or propose one.
2. Baseline with realistic data/load. No measurement → no optimization claim.
3. Locate: profile CPU/memory/allocations, query plans (EXPLAIN), N+1, network round trips, lock contention, algorithmic complexity.
4. Fix the biggest bottleneck first: algorithm/data structure → queries/indexes → batching → caching (define invalidation) → concurrency.
5. Re-measure under the same conditions; report before/after numbers.
6. L3+: load/stress test; capacity plan (headroom, growth, limits).
