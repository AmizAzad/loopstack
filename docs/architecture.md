# Architecture

## Layout
```
core/principles.md   the only always-on text
skills/*.md          one file per command: frontmatter (name, description, explicit?) + terse steps
agents/*.md          role lenses (Architect, Skeptic, …) for /debate, /compete, /swarm
templates/*.md       optional artifacts (ADR, test plan, postmortem, …), read only when needed
extensions/          example layer (java-spring)
adapters/*.js        harness-specific output, nothing else
bin/amizloop.js      CLI: init, sync, list
tests/               budgets, integrity, generation
```
Skill = command = workflow. amizloop has no separate `workflows/`, `commands/`, `checklists/` or `modes/` directories. Every capability lives in one file, so the agent never follows an indirection or loads the same text twice. Routes, levels and quality gates live only in [skills/amizing-mode.md](../skills/amizing-mode.md).

## Concepts
- **Loop.** Every task runs observe → understand → act → verify → learn → adjust. Deploying does not end the loop: `/observe` feeds `/debug`, `/performance` and `/product`. Lessons are appended to `.amizloop/learnings.md`.
- **Levels L0–L4** set how much process a task gets. L0 is act → verify. L4 adds a threat model, a staged rollout and sign-off.
- **Routes** (bug, feature, incident, refactor, question) are starting points. `/amizing-mode` drops steps that add nothing and adds steps when risk requires them.
- **Git flow** (`/ship`): before the first edit, fetch the parent branch (the one the user names, else the repo default) and branch from its latest commit. After `/verify` passes, commit only the task's files. Push only with user approval. Never push to the parent branch and never force-push a shared branch. Skipped outside git or when the user says to stay on the current branch.
- **Gates** turn on only when triggered: requirements, architecture, implementation, testing, security, review, verification, release/deployment, production. A failed gate sends work back to the failing step. Extensions can add gates.
- **Evidence tags**: FACT, OBS, ASSUME, HYPO, REC, DECISION. A claim without a citation is never a FACT.
- **Review severities**: BLOCKING, IMPORTANT, SUGGESTION, NIT.

## Token strategy
1. The always-on text is the principles plus a 4-line command block: about 370 tokens on Claude and about 450 elsewhere, because other harnesses also get a skill-name index. A test enforces the limit.
2. Skills are ≤1.6 KB each (amizing-mode ≤3 KB, also test-enforced) and load only when their step runs.
3. Skills point to other skills (`/security`) and to templates by path instead of copying them.
4. `/amizing-mode` sizes the task first, so L0 and L1 tasks never load most skills.
5. Extensions are merged when `sync` runs, not while the agent works, so adding layers costs no extra reads.
6. On Claude, explicit-only skills carry `disable-model-invocation`. Their descriptions never enter the context and they cannot fire by themselves.
7. Subagent briefs (`/swarm`, `/debate`) contain only the context each agent needs and ask for terse output. Debate turns are capped at 150 words.
8. `/caveman` shortens user-facing prose. Code, errors, warnings and UNVERIFIED items stay exact.

## Multi-agent design
- `/arena`: one agent compares 2–4 approaches with a weighted score matrix and a sensitivity check.
- `/debate`: role agents propose, critique and defend. A neutral synthesis follows, with no fabricated consensus and no "objectively correct" winner.
- `/compete`: agents build competing implementations in isolated worktrees. All candidates are judged by the same tests, and the user picks one.
- `/swarm`: independent units run on parallel workers. amizloop refuses to swarm small or tightly coupled tasks.
- All of these are opt-in only. `/amizing-mode` may suggest them but never runs them. If a harness has no subagents, they run as clearly separated personas or in sequence.

## Generated in a target repo
```
amizloop.json                          harnesses, layers, custom adapters
.amizloop/{skills,agents,templates,gates}/   merged output (generated, do not edit)
.amizloop/learnings.md                 loop memory (yours; never overwritten)
.amizloop/manifest.json                tracks generated files so sync can prune them safely
+ harness files (see adapters.md)
```
