# Changelog

## 0.3.0 (2026-11-02)

### Formal checks and statecharts (used on signal)
- `/formal` model-checks or proves a costly promise that tests rarely reach, such as races, retries, leases, ordering or state machines. It picks the tool from the question, shows the check can fail, never weakens a property to pass it, and replays each counterexample in real code. It also registers a gate (`templates/formal-gate.md`) that records the covered code and the sync commit, so `/verify` reruns the check and handles drift. This merges pstack's create and maintain flows into one skill.
- `/statechart` checks a TLA+ model and draws a Mermaid statechart in the reader's words, with the shortest path to each broken rule.
- `bin/statechart.js` (Node builtins only, copied to `.loopstack/statechart.js` on sync):
  - runs TLC, then reruns without each broken rule and checks each temporal property on its own;
  - writes `report.md`, `tlc.out`, and `chart.mmd` when the model has ≤500 states;
  - takes an optional `view` module (`state`, `step`, `title`).
- `/amizing-mode` adds both skills to any route only on signal (never for CRUD, glue or UI), and `/design` points to them.

### Other changes
- The `amizing-mode` budget rises from 3000 to 3400 B: +246 B for the trigger line, with room for the telemetry step. Other skills stay ≤1.6 KB.
- Tests normalize CRLF, so the suite passes on Windows checkouts with `core.autocrlf`.

### Breaking changes & upgrade steps
None. Pull loopstack and run `loopstack sync`. To use `/statechart` or a TLA+ `/formal` check, install Java 11+ and save the pinned `tla2tools.jar` (see `node .loopstack/statechart.js --help`).

### Rollback
Sync from loopstack 0.2.0. The two skills, the template and `.loopstack/statechart.js` are pruned. Gates in `.loopstack-local/` and models in your repo stay, because they are your files.

## 0.2.0 (2026-10-06)

### Usage dashboard (opt-in)
- `"telemetry": true` in `loopstack.json` adds one log step to `/amizing-mode` (295 B; always-on block unchanged). Each task appends one JSON line of counts to `.loopstack/runs.jsonl`.
- `loopstack dashboard` and the explicit-only `/ls-usage-dashboard` write one offline HTML file with:
  - KPI tiles and insights;
  - charts for size mix, gate failures (bar and level heatmap), rework, skill usage and never-used skills, route mix, sizing accuracy, UNVERIFIED trend, the ship funnel, skills and minutes per level, lessons per week, and an activity calendar;
  - fleet health, with version and harness drift per project;
  - a sortable task table;
  - filters and CSV/JSON export.
- `--dir` repeats for a team view, `--json` prints the aggregates, and `--by-member` is an opt-in split by git author name.
- Sync manages `.gitattributes` (`merge=union` for the log) and `.gitignore` blocks with `#` markers when telemetry is on.

### Other changes
- `.loopstack/manifest.json` now records `version`.
- `/ls-usage-dashboard` adds its name to the explicit-only list in the always-on block (about 5 tokens).

### Breaking changes & upgrade steps
None. Pull loopstack and run `loopstack sync`, or have one teammate sync and commit. Telemetry stays off until enabled. Old manifests without `version` show as `pre-0.2` on the dashboard.

### Rollback
Remove `"telemetry"` and sync. The log step, dashboard script and git blocks are removed, and `runs.jsonl` is left as inert data.
