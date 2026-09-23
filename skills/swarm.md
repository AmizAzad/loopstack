---
name: swarm
description: Explicit only. Split work into independent units and run them on parallel agents.
explicit: true
---
# /swarm
Run only when the user invokes it. Small or tightly coupled task → say so and work serially instead.
1. Decompose into independent units: disjoint files, clear interfaces, own verification. 2–5 workers.
2. Brief per worker, only the context it needs: goal, files it may touch, contracts, constraints, done-criteria, terse output format.
3. Dispatch concurrently via the harness's subagent/parallel facility (isolated worktrees for code edits when available). No subagents → run units in sequence.
4. Integrate: merge, resolve conflicts, full build + tests.
5. /verify the integrated result; report per-unit outcome.
