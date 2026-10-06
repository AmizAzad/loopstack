# loopstack

An adaptive SDLC loop for AI coding agents. It sizes each task and runs only the workflows that task needs, so every step stays small and token-cheap.

```
loopstack = engineering principles (always loaded, ~370 tokens)
          + small skills (loaded only when a step runs)
          + /amizing-mode orchestration (size → route → gate → verify → learn)
```

Works with **Claude Code, GitHub Copilot, OpenAI Codex, Grok CLI**. Zero dependencies (Node ≥ 18).

## Quick start

```sh
git clone <this repo> loopstack
cd your-project
node ../loopstack/bin/loopstack.js init --claude      # or --copilot --codex --grok --all
```

Then ask your agent: `Implement CSV export for invoices`. Tasks with no command go through `/amizing-mode`; trivial ones are just done and verified. You can also call a skill directly: `/review`, `/debug`, and so on.

In a git repo, code changes go on a new branch created from the latest parent branch. They are committed after `/verify` passes and pushed only after you approve (`/ship`).

Re-run `loopstack sync` after you pull a new loopstack or change your extensions. `loopstack list` shows the merged skills.

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

Lessons go in `.loopstack/learnings.md` and are read back at the start of L2+ tasks. Signals from `/observe` feed `/debug`, `/performance` and `/product`.

## Usage dashboard (opt-in)

Add `"telemetry": true` to `loopstack.json` and run `loopstack sync`. Each `/amizing-mode` task then appends one line of counts to `.loopstack/runs.jsonl`: no prompts, no code, no names. `/ls-usage-dashboard` (or `loopstack dashboard --dir a --dir b`) turns those lines into one offline HTML page. It shows task sizes, gate failures, rework, skill use, sizing accuracy, the ship funnel, project drift and suggested adjustments. Off by default; see [docs/dashboard.md](docs/dashboard.md).

## Upgrading

1. Pull the new loopstack.
2. Run `loopstack sync` in each repo, or have one teammate sync and commit the generated files so everyone gets them on pull.

There are no manual migration steps. Since 0.2.0 the manifest records the loopstack version, which the dashboard uses to flag repos that are behind; older manifests show as `pre-0.2`. Telemetry stays off until a team turns it on. To roll back, remove `"telemetry"` and sync: the log step, script and git blocks are removed, and `runs.jsonl` is kept as inert data.

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
| **Explicit-only** (never auto-run) | `/interrogate` `/arena` `/swarm` `/debate` `/compete` `/caveman` (off: `/normal` or `/caveman off`) `/ls-usage-dashboard` |

Each command is one file in [skills/](skills/). The skill file is the documentation for that command.

## Docs

- [Architecture & concepts](docs/architecture.md): design, token strategy, multi-agent and caveman design
- [Harness setup](docs/adapters.md): what gets generated for each agent
- [Extending](docs/extending.md): add rules, skills, gates, agents or adapters without forking
- [Usage dashboard](docs/dashboard.md): opt-in telemetry, log schema, metrics, privacy ([ADR 0001](docs/adr/0001-usage-telemetry.md))
- Examples: [bug (L1)](examples/bug.md) · [feature (L3)](examples/feature.md) · [incident (L4)](examples/incident.md) · [debate](examples/debate.md) · [dashboard prompt](examples/dashboard-prompt.md)

## Test

```sh
npm test
```

The tests enforce skill size budgets, the always-on token budget, cross-reference integrity, the opt-in-only rule for explicit skills, generation for every harness, layering and cleanup.
