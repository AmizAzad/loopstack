---
name: investigate
description: Evidence-driven investigation of unexplained behaviour, failures or data anomalies.
---
# /investigate
1. Define observed vs expected precisely.
2. Collect: logs, metrics, traces, recent changes (deploys, config, deps, data), code paths.
3. Build timeline and correlations; tag FACT / OBS / HYPO.
4. Rank hypotheses; run the cheapest test that could disprove each.
5. Conclude only what evidence supports; list unknowns and next checks.
Fix → /debug. Outage → /incident.
