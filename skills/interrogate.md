---
name: interrogate
description: Explicit only. Deep-question a plan, design, requirement or claim to expose assumptions and gaps.
explicit: true
---
# /interrogate
Run only when the user invokes it.
1. Extract the target's claims and assumptions; list them.
2. For each important one: what evidence? Check code/docs/data; tag FACT / ASSUME / HYPO.
3. Ask "why" repeatedly (≤5) until a root reason or an unsupported premise appears.
4. Hunt contradictions (requirement vs requirement, code vs docs, plan vs constraints), unknowns, missing edge/failure cases, hidden dependencies.
5. Pre-mortem: "it failed in 6 months — why?"
Output: table `claim | status | evidence | open question`; top 3 risks; questions for the user; what would resolve each gap. Challenge, don't obstruct.
