---
name: amizing-mode
description: Orchestrate an engineering task - size it, run only the needed skills, verify, learn.
---
# /amizing-mode
1. Intake: restate goal in one line. Goal or acceptance unclear → ask (batched) before acting. L2+: read `.amizloop/learnings.md` if present.
2. Size (highest that applies):
| L | Signals | Process |
|---|---------|---------|
| 0 trivial | typo, copy, obvious one-liner | act → verify |
| 1 small | local bug/feature, 1–3 files, no contract/data change | understand → act → test → self-review → verify |
| 2 moderate | multi-module, new behaviour, UI/API addition | + requirements (testable AC), light design, plan, review |
| 3 complex | new component, schema/API contract change, perf-critical, cross-service | + research, design, ADR if significant, security, test plan, release/rollback plan |
| 4 high-risk | auth/payments/PII, data migration, prod incident, architecture shift, irreversible | + threat model, staged rollout, proven rollback, user sign-off at gates |
3. Route, then drop steps that add nothing and add steps risk demands ([ ] = if relevant):
- bug: understand → debug → [tdd] → implement → test → review → verify
- feature: [product] → requirements → [research] → [architect/design/adr/api/database/frontend] → plan → implement|tdd|bdd → test → review → [security/performance] → verify → [release → deploy → observe]
- incident: incident (mitigate first) → verify → investigate → corrective action → verify → observe
- refactor/upgrade: understand → test (pin behaviour) → refactor|modernize → verify
- question: understand|research → answer with evidence tags
Each step = skill `/name`; load it only when the step runs.
4. Gates (only when triggered): requirements L2+ · architecture L3+ · implementation (builds, lint) · testing · security (auth, input, secrets, deps, PII) · review L1+ · verification always · release/deployment if shipping · production L3+ shipped · extension gates `.amizloop/gates/*.md`. Gate fails → loop back to the failing step.
5. Execute: one-line result per step. Evidence contradicts plan → replan.
6. Verify: /verify (L0: quick check, still with evidence).
7. Learn: non-obvious lesson (gotcha, wrong assumption, missing test) → append one line to `.amizloop/learnings.md`.
8. Report: done · evidence · unverified · next loop (follow-ups, risks).
Never auto-run explicit-only skills; suggest one when it clearly helps (e.g. /arena for a close design call).
