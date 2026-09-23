---
name: modernize
description: Upgrade dependencies/frameworks, pay down tech debt, evolve or retire systems safely.
---
# /modernize
- Inventory: versions, EOL dates, CVEs, debt hotspots (churn × complexity).
- Upgrades: read changelog/breaking changes/migration guide first; one major upgrade at a time; full test run; no blind bulk bumps.
- Tech debt: rank by cost of delay; fix where work already happens.
- Evolution: strangler fig, parallel run, flags; keep old path until new one is verified.
- Retirement: find all consumers (code + traffic), announce deprecation, migrate, confirm zero traffic, remove code/data/infra, archive docs.
