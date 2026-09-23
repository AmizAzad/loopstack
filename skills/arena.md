---
name: arena
description: Explicit only. Compare competing approaches against weighted criteria and expose trade-offs.
explicit: true
---
# /arena
Run only when the user invokes it.
1. Frame: decision, constraints, weighted criteria (e.g. correctness, simplicity, performance, risk, cost, reversibility, team fit). Confirm if unclear.
2. Contenders: 2–4 genuinely different approaches, user-supplied ones as-is; include "do less" when plausible.
3. Each: sketch, strengths, weaknesses, risks, evidence (prototype, benchmark, docs) where cheap.
4. Challenge: strongest objection to each, answered or conceded.
5. Score matrix + sensitivity: which priority change flips the winner.
6. Recommendation with confidence and revisit conditions; significant → /adr.
Single agent by default; one agent per contender → /debate. Scores reflect the stated criteria, not objective truth.
