---
name: plan
description: Break work into small, ordered, verifiable steps with risks and a verification strategy.
---
# /plan
- Steps small, independently verifiable, dependency-ordered; prefer shippable increments.
- Per step: files/components, how verified (test/command), risk.
- Call out migrations, feature flags, compatibility, rollout/rollback, independent pieces (→ /swarm only if user opts in).
- Verification strategy up front: which tests and evidence prove done.
L1: 3–5 bullets inline. L3+: `.amizloop/templates/plan.md`. Evidence changes → replan; never follow a stale plan.
