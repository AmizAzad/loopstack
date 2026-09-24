---
name: research
description: Gather cited evidence from code, docs, libraries and standards before deciding.
---
# /research
1. State the question and the decision it informs.
2. Sources, nearest first: codebase patterns → project docs/ADRs → dependency/framework docs (installed version) → standards & security guidance (OWASP etc.) → external libraries, prior art.
3. Cover as relevant: capabilities, limits, performance, security, operational cost, licence, maintenance health.
4. Tag findings FACT / OBS / ASSUME / HYPO / REC / DECISION. Cite file:line or URL. No citation → not FACT.
5. Stop when the decision is supportable; list what is still unknown.
L3+: `.loopstack/templates/research.md`.
