---
name: observe
description: Instrument code and read production signals - logs, metrics, traces, SLOs, alerts.
---
# /observe
Instrument new/changed paths:
- Structured logs with correlation/trace id; no secrets or PII.
- Metrics: RED (rate, errors, duration) per service, USE (utilization, saturation, errors) per resource, key business KPIs.
- Distributed tracing across hops; health/readiness checks.
Operate:
- SLI → SLO → error budget. Alert on symptoms/budget burn, not causes; every alert actionable with a runbook (`.amizloop/templates/runbook.md`).
- After deploy compare to baseline; report observed numbers.
Feed the loop: regression → /debug, trend → /performance, capacity limit → /plan, usage insight → /product.
