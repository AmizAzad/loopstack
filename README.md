# amizloop

An adaptive SDLC loop for AI coding agents. It sizes each task and runs only the workflows that task needs, so every step stays small and token-cheap.

```
amizloop = engineering principles (always loaded, ~370 tokens)
         + small skills (loaded only when a step runs)
         + /amizing-mode orchestration (size → route → gate → verify → learn)
```

Works with **Claude Code, GitHub Copilot, OpenAI Codex, Grok CLI**. Zero dependencies (Node ≥ 18).

## Quick start

```sh
git clone <this repo> amizloop
cd your-project
node ../amizloop/bin/amizloop.js init --claude      # or --copilot --codex --grok --all
```

Then ask your agent: `Implement CSV export for invoices`. Tasks with no command go through `/amizing-mode`; trivial ones are just done and verified. You can also call a skill directly: `/review`, `/debug`, and so on.

In a git repo, code changes go on a new branch created from the latest parent branch. They are committed after `/verify` passes and pushed only after you approve (`/ship`).

Re-run `amizloop sync` after you pull a new amizloop or change your extensions. `amizloop list` shows the merged skills.

## The loop

```
DISCOVER → UNDERSTAND → RESEARCH → DEFINE → DESIGN → PLAN → BUILD → TEST → REVIEW
   ↑                                                                        ↓
IMPROVE ← LEARN ← OPERATE ← OBSERVE ← DEPLOY ← RELEASE ←────────────── VERIFY
```

Each task runs a slice of it. The slice depends on the task's level:

| Level | Example | Process |
|---|---|---|
| L0 trivial | typo | act → verify |
| L1 small | local bug | understand → debug → implement → test → review → verify |
| L2 moderate | new endpoint | + requirements, light design, plan |
| L3 complex | new component, contract change | + research, design/ADR, security, release plan |
| L4 high-risk | payments, data migration, incident | + threat model, staged rollout, sign-off |

Lessons go in `.amizloop/learnings.md` and are read back at the start of L2+ tasks. Signals from `/observe` feed `/debug`, `/performance` and `/product`.

## Commands

| Area | Commands |
|---|---|
| Orchestrate | `/amizing-mode` |
| Product & definition | `/product` `/requirements` `/bdd` |
| Understand | `/understand` `/research` `/investigate` |
| Design | `/architect` `/design` `/adr` `/api` `/database` `/frontend` |
| Build | `/plan` `/implement` `/tdd` `/refactor` `/modernize` `/document` |
| Quality | `/test` `/debug` `/review` `/security` `/performance` `/verify` |
| Ship & operate | `/ship` `/release` `/deploy` `/rollback` `/observe` `/incident` |
| **Explicit-only** (never auto-run) | `/interrogate` `/arena` `/swarm` `/debate` `/compete` `/caveman` (off: `/normal` or `/caveman off`) |

Each command is one file in [skills/](skills/). The skill file is the documentation for that command.

## Docs

- [Architecture & concepts](docs/architecture.md): design, token strategy, multi-agent and caveman design
- [Harness setup](docs/adapters.md): what gets generated for each agent
- [Extending](docs/extending.md): add rules, skills, gates, agents or adapters without forking
- Examples: [bug (L1)](examples/bug.md) · [feature (L3)](examples/feature.md) · [incident (L4)](examples/incident.md) · [debate](examples/debate.md)

## Test

```sh
npm test
```

The tests enforce skill size budgets, the always-on token budget, cross-reference integrity, the opt-in-only rule for explicit skills, generation for every harness, layering and cleanup.
