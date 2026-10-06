# Changelog

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
