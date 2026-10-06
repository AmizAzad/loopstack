/amizing-mode Build the loopstack usage dashboard described below.

# Goal
Give each developer and team lead a view of how loopstack is used across projects: what sizes of task run, which gates fail, how much rework happens, which skills earn their tokens, and where the process needs tuning. The "learn → adjust" step should run on data, not anecdotes.

# Context (verify before relying on it)
- Zero dependencies, Node ≥18. CLI lives in `bin/loopstack.js` (`init`, `sync`, `list`). Harness wiring lives in `adapters/*.js`.
- No usage data is captured today, so capture has to be built before the dashboard.
- Budgets are test-enforced: skills ≤1.6 KB, `amizing-mode.md` ≤3 KB (currently ~2.66 KB, so ~340 B headroom), always-on block ≤600 tokens.
- `sync` regenerates `.loopstack/{skills,agents,templates,gates}` and prunes only the files listed in `.loopstack/manifest.json`. `.loopstack/learnings.md` belongs to the user and is never overwritten.
- Teams commit the generated files, so teammates get updates without running the CLI.
- From `.loopstack/learnings.md`: the rename to loopstack needed manual migration for old installs. This feature must need none.

# Sizing and process
Treat this as L3: a new component plus a new data contract (the event schema) that rolls out across many repos. Run requirements → research → design → ADR → plan → implement/tdd → test → review → security → verify → release.
- Write an ADR for the capture mechanism (Part A).
- If per-member identity is shown anywhere, apply L4 rigour to privacy and ask the user to sign off.
- Don't add anything Process ∝ risk doesn't ask for.

# Constraints (non-negotiable)
1. **Token cost.** Capture may add at most ~300 B to `amizing-mode.md`, 0 B to the always-on block, and one file append per task. The dashboard is produced by the CLI, so the agent spends 0 tokens rendering it. Don't add new always-on rules.
2. **Zero dependencies and offline.** Output is one self-contained HTML file with inline CSS, inline SVG charts and vanilla JS. No CDNs, no chart libraries, no network calls, no server.
3. **Harness-agnostic.** Capture must work on Claude, Copilot, Codex and Grok. Harness-specific extras are optional.
4. **Backward compatible.** Existing `loopstack.json` files, layers, manifests and harness files keep working unchanged. New config keys are optional.
5. **Privacy by design.** The log holds only enums, counts and timestamps. Never log prompts, code, file paths, branch names, commit messages, secrets or free text.
6. **Simplest thing first.** Ship P0 before P1. P2 needs evidence that it's needed.

# Part A: Capture (the data contract)
REC, to be confirmed in the ADR: at /amizing-mode step 8 (Report), the agent appends one JSON line to `.loopstack/runs.jsonl`. Draft schema v1, ≤200 B per line:
```json
{"v":1,"ts":"2026-10-06T10:42Z","lvl":2,"lvl0":1,"route":"feature","skills":["requirements","plan","implement","test","review","verify"],"gates":{"testing":1,"review":0},"loops":1,"unv":0,"learn":1,"ship":"pushed","h":"claude","dur":38}
```
- `lvl0` is the first size and `lvl` the final size, so you can measure resizing.
- `gates` maps gate name to failure count, including extension gates.
- `loops` counts loop-backs (rework).
- `unv` counts UNVERIFIED items.
- `learn` counts learnings appended.
- `ship` is one of `none|committed|pushed|pr`.
- `h` is the harness.
- `dur` is wall-clock minutes, if known; otherwise omit it.

The ADR must weigh these options:
- (a) The agent appends the line. This is the default: harness-agnostic, but self-reported and costs ~1 tool call per task.
- (b) Claude Code hooks (e.g. PostToolUse on Skill). These are deterministic and cost no tokens, but only work on Claude and touch the user's `settings.json`.
- (c) Inferring usage from git history. Free but approximate. Useful for backfill only.

Tag the reliability of self-reported data as ASSUME on the dashboard.

Rules:
- The schema is versioned with `v`. Readers must accept unknown fields and skip malformed lines, counting them and showing the count. Never crash on bad input.
- `runs.jsonl` is user data. Keep it out of the manifest; sync and init must never overwrite or prune it.
- **Who.** The agent writes no identity. When rendering, the CLI may get the author and commit date for each line from `git blame --line-porcelain`. Uncommitted lines show as "local".
- **Team merges.** Many members append to the same file, which can conflict. Evaluate `.gitattributes` with `merge=union`, which git supports natively, against per-user files. Pick one in the ADR.
- **Gap.** Skills invoked directly (e.g. `/review` without /amizing-mode) aren't captured in v1. Document this as a known gap and don't fix it with more always-on text.
- **Opt-out.** `"telemetry": false` in `loopstack.json` makes sync emit the skill without the logging line. Data never leaves the repo.

# Part B: Dashboard
Command: `loopstack dashboard [--dir <repo>]... [--out loopstack-dashboard.html] [--since 90d] [--json] [--by-member]`.
- Repeating `--dir` aggregates projects. Also accept a list of paths from an optional `loopstack-dashboard.json`.
- `--json` emits the aggregates so agents and CI can use them.
- Put the dashboard code in its own module (e.g. `bin/dashboard.js`) so `loopstack.js` stays small, and update `package.json` `files`.

Features. Each one answers a question. Priority: P0 = MVP, P1 = next, P2 = only with evidence.

| # | Question it answers | Visual | P |
|---|---|---|---|
| 1 | How much, how healthy? | KPI tiles with sparklines: tasks, first-pass verify rate, rework rate, gate failure rate, open UNVERIFIED, learnings added | P0 |
| 2 | What size is our work? | Stacked bar of L0–L4 per week, plus a donut for the overall mix | P0 |
| 3 | Which gates fail? | Horizontal bar of failures by gate (core and extension), plus a heatmap of gate × level | P0 |
| 4 | How much rework? | Line of loops per task over time, plus a histogram of loops per task | P0 |
| 5 | Which skills are used? | Ranked horizontal bar. Mark explicit-only skills. List skills never used, as candidates to prune or improve | P0 |
| 6 | What kind of work? | Route mix (bug, feature, incident, refactor, question) as a 100% stacked bar per project | P0 |
| 7 | Filtering and drill-down | Filters for date, project, level, route and harness. A sortable task table. CSV/JSON export | P0 |
| 8 | Do we size tasks correctly? | Sizing-accuracy matrix (`lvl0` × `lvl`). Off-diagonal cells mean resizing | P1 |
| 9 | Where does failure send work back? | Sankey from gate failure to the step it loops back to (needs `loops` detail; check the schema cost first) | P1 |
| 10 | Is verification debt growing? | Area chart of UNVERIFIED items over time | P1 |
| 11 | Is work getting shipped? | Funnel: task → committed → pushed → PR | P1 |
| 12 | Is the process proportional to risk? | Box plot of `dur` and skills per task by level. Flag L0/L1 tasks that loaded heavy skills | P1 |
| 13 | Is the loop learning? | Learnings added per week. Count the lines in each repo's `learnings.md` over git history | P1 |
| 14 | Activity rhythm | Calendar heatmap of tasks per day | P1 |
| 15 | Fleet health across projects | Small multiples per project, a table of loopstack version and harness per project (drift), and the date of the last event per project | P1 |
| 16 | What should we adjust? | Insights panel: deterministic rules, no LLM, each with its evidence and a suggested skill. E.g. "security gate fails in 40% of L3 → run /security earlier", "/tdd never used on bugs", "repo X has had no events for 30 days → check the install" | P1 |
| 17 | What does the process cost? | Estimated process tokens per task: bytes of the skills loaded ÷ 4, by level. Tag as an estimate | P2 |
| 18 | Incident view | Count and duration of incidents, plus rework after an incident | P2 |
| 19 | Per member | Same charts split by git author. Off by default (`--by-member`), aggregates only, never a leaderboard | P2 |
| 20 | Backfill | Approximate history from git (branch prefixes, Conventional Commit types), drawn in a distinct style and labelled "inferred" | P2 |

UX requirements:
- Layout and states: a responsive grid, light and dark themes, and an empty state that explains how to start capturing. Show the data range and the count of skipped lines.
- Charts:
  - Use a colour-blind-safe palette and direct labels instead of legends where possible.
  - Every chart gets a title phrased as a question, a tooltip, and a table or text fallback for accessibility.
  - Use consistent level colours, from L0 calm to L4 alarm.
- Performance: render 10k events in under 1 s. Measure this; don't assume it.

# Part C: Rolling out to existing installs (many projects, many members)
There is no per-repo manual migration. The upgrade path:
1. Each member pulls the new loopstack and runs `loopstack sync` once in each repo, or one member syncs and commits the generated files so the rest get them on pull.
2. `sync` writes the new `amizing-mode` text (with the logging line). It also records `"version"` from `package.json` in `manifest.json`, which is additive; old manifests without it read as "pre-0.2" in panel #15. If the ADR chooses it, sync also adds the `.gitattributes` union-merge entry, managed safely (marker comment, idempotent, user lines untouched).
3. Repos that haven't upgraded show as stale or "no data" on the dashboard; they never cause errors. The dashboard on a new loopstack must read repos still on 0.1.0.
4. Team view: a lead clones or pulls the project repos and runs `loopstack dashboard --dir a --dir b …`. Optional P2: a CI snippet that builds the HTML as a build artifact. Document it; don't build a server.
5. Rollback: `"telemetry": false` + sync removes the logging line. `runs.jsonl` is inert data that the user can delete. Downgrading loopstack leaves the extra manifest field and log file unused and harmless.

Docs:
- Add a README "Upgrading" section (steps, opt-out, privacy statement).
- Add a `docs/dashboard.md` with the schema, metrics definitions and limits.
- Bump the version to 0.2.0 and add release notes via /release.

# Security and privacy
- Escape every string from the log before it reaches the HTML; a malicious contributor could commit a crafted jsonl.
- Validate types, set a CSP meta tag (no external sources), and don't use `eval` or `innerHTML` on data.
- `--dir` reads only `.loopstack/runs.jsonl`, `learnings.md`, `manifest.json` and git metadata. It writes only `--out`.
- Run /security on the change.

# Tests (extend `tests/loopstack.test.js`, `node --test`)
- The existing budget tests still pass, and the `amizing-mode` growth is ≤300 B.
- Sync on a fresh repo and on a simulated 0.1.0 install (manifest without `version`, no `runs.jsonl`): it succeeds, keeps `runs.jsonl`, and never prunes it.
- `"telemetry": false` produces a skill without the logging line.
- Aggregation on a fixture jsonl: exact KPI numbers per level, gate and skill. It must handle malformed lines, unknown fields, `v:2` lines (skip or partial read, as the ADR decides), empty or missing files, and multiple `--dir` values.
- XSS fixture: a skill name containing `<script>` renders inert.
- Output is deterministic for fixed input. Snapshot the `--json` output.
- Performance: generate a 10k-line fixture and assert the time budget.

# Acceptance criteria
1. A completed /amizing-mode task appends exactly one valid v1 line, on every harness.
2. `loopstack dashboard` produces a single offline HTML file with every P0 feature, working filters and a correct empty state.
3. A repo on 0.1.0 upgrades with one `sync` and no manual steps. Mixed-version fleets render without errors.
4. The always-on token count is unchanged; `npm test` is green.
5. The log contains no free text or identity; per-member views are opt-in.

# Before implementing, ask me (batched)
1. Should telemetry default to on (local-only) or off (opt-in)?
2. Do we need per-member views at all?
3. Should L0 tasks be logged? They cost one append each.
4. Which P1 items go into this release?

# Report
- What was done, with evidence (test output, a sample dashboard screenshot or path, byte deltas).
- What is UNVERIFIED (e.g. real Copilot, Codex and Grok runs).
- The next loop: P1/P2 candidates, plus metrics to check after 2 weeks of real data (the share of tasks logged, reasons for skipped lines).
- Append the non-obvious lessons to `.loopstack/learnings.md`.
