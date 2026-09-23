---
name: compete
description: Explicit only. Agents build competing implementations, judged by the same tests and criteria.
explicit: true
---
# /compete
Run only when the user invokes it. /debate variant where each role ships a working candidate.
1. Shared spec: requirements, acceptance tests, criteria (tests pass, simplicity, performance, risk).
2. N agents (default 2) implement independently in isolated worktrees/branches.
3. Run identical tests/benchmarks on each; record actual results.
4. Cross-review with /review severities.
5. Synthesis: results table, trade-offs. User picks; merge nothing without approval.
