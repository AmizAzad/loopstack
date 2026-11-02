---
name: formal
description: Model-check or prove a costly promise tests rarely reach - races, retries, ordering, state machines.
---
# /formal
Use only where a break harms users and tests rarely reach it: concurrency, retries, leases, ordering, idempotency, protocols, state machines, parsers, unsafe code. Not for CRUD, glue or UI.
1. Target: the strongest such promise, not the easiest. Promise and harm: one plain sentence each.
2. Tool fits the question; say why. Bad event order → TLA+ model, run with /statechart. Every input of the real code → code verifier (Kani, CBMC, Dafny, SMT), else property tests on the real code. Every size → proof.
3. True to code: each variable and action cites file:function; one atomic step in code = one action. Small bounds; state them.
4. Can fail: break the guarded code (drop a check, reorder a step) → check must catch it; revert.
5. Current code breaks it → finding, not drift: replay the counterexample in real code (test or repro), then report it in the code's words. Never weaken the property or model to pass; no product edits unless asked.
6. Keep in sync: write `.loopstack-local/gates/formal-<area>.md` from `.loopstack/templates/formal-gate.md`, then `loopstack sync` (or ask the user). Prove the gate once on a scratch break.
Drift (gate fired): diff covered code since its sync commit; update the model from the code, not the result; rerun; prove it can still fail. Outcome: in sync | updated | bug | blocked. Move the sync commit only when the model matches.
Report: property, tool, bounds, result, VERIFIED/UNVERIFIED, gaps.
