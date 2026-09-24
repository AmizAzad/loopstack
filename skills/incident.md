---
name: incident
description: Run a production incident - mitigate, restore, root-cause, corrective actions, postmortem.
---
# /incident
Production-changing actions need user approval.
1. Assess impact (who, what, since when), severity; post status.
2. Mitigate first: rollback, flag off, scale, failover, block bad traffic. Restore before diagnosing.
3. Verify recovery via metrics/smoke.
4. Timeline from logs, metrics, deploys (timestamped facts).
5. Root cause via /investigate; 5 whys down to systemic gaps (tests, monitoring, process), no blame.
6. Corrective actions with owner and priority: regression tests, alerts, runbook updates.
7. Log: `.loopstack/templates/incident.md`. Sev1–2 blameless postmortem: `.loopstack/templates/postmortem.md`.
