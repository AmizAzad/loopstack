---
name: rollback
description: Revert a bad release quickly and safely, protecting data.
---
# /rollback
1. Decide: ongoing user impact → roll back by default rather than fix forward.
2. Method: redeploy previous artifact · flag off · revert commit · failover.
3. Data: confirm schema compatibility; no destructive data revert without backup and user approval.
4. Verify health, smoke, metrics back to baseline.
5. Record what/when/why; user-impacting → /incident.
Template: `.amizloop/templates/rollback.md`.
