# 0001. Opt-in usage log written by the agent, rendered by the CLI
Status: accepted · Date: 2026-10-06

Context: loopstack had no data on how it is used (task sizes, gate failures, rework, skill use), so "learn → adjust" ran on anecdotes. Teams run loopstack in many repos with Claude, Copilot, Codex and Grok.

Problem: capture one record per task and show it as a dashboard, without breaking the token budget, the zero-dependency rule, privacy or existing installs.

Constraints: always-on block unchanged; `amizing-mode` ≤3 KB and grows ≤300 B; no dependencies, no network, no server; works on every harness; old installs upgrade with one `sync`; no free text or identity in the log; off unless a team turns it on.

Options:
1. Agent appends one JSON line at the end of /amizing-mode — works on every harness, costs ~295 B of skill text and one append per task / self-reported, misses skills invoked directly.
2. Claude Code hooks (PostToolUse on Skill) — deterministic, no tokens / Claude only, must merge into the user's `settings.json`, sees skill calls but not levels, gates or rework.
3. Infer from git history (branch prefixes, commit types) — free / approximate, no levels or gates; fine for backfill only.
4. For team merges: per-user log files — no conflicts / file names carry identity, more files to read.
5. For team merges: one `runs.jsonl` with `merge=union` in `.gitattributes` — native git, no identity in the log / union merge can keep both sides of a hand-edited line (rare: the file is append-only).

Decision:
- Option 1 plus option 5. The log step lives in `core/telemetry.md` and is spliced into `amizing-mode` by `sync` only when `loopstack.json` has `"telemetry": true`. Off means zero bytes.
- With telemetry on, sync also writes `.loopstack/dashboard.js` (a copy of `bin/dashboard.js`, Node builtins only) so `/ls-usage-dashboard` works without the CLI. It also manages marker blocks in `.gitattributes` (union merge) and `.gitignore` (the generated HTML).
- `runs.jsonl` is user data: never in the manifest, never pruned or overwritten.
- Schema v1. Readers validate known fields, ignore unknown ones and skip malformed lines with a visible count. A line with `v` > 1 is read if its v1 fields are valid, so v2 must stay additive.
- Identity comes only from `git blame` author names at render time, only with `--by-member` (user sign-off 2026-10-06). Emails are never read.
- The manifest records `version`, so the dashboard can show version drift. Old manifests read as `pre-0.2`.

Consequences (+/−):
- + Every harness supported; no new always-on text; one sync to upgrade; opt-out leaves the data inert.
- + Same `aggregate()` runs in Node (`--json`, tests) and in the page (filters), so numbers match.
- − Data is self-reported (tagged ASSUME on the dashboard); skills called without /amizing-mode are not counted; `ts` may be date-only when the agent lacks a clock.
- − Telemetry costs one file append per task, about 300 B more skill text per /amizing-mode load.

Revisit when: self-reported numbers diverge from git or CI evidence; teams need direct-skill counts (consider option 2 as an add-on); the Sankey of loop-back targets (needs a per-loop field) is requested.
