# Usage dashboard

See how loopstack is used across your projects: task sizes, gate failures, rework, skill use, shipping and drift. Capture is **off by default**. Nothing leaves the repo, and the dashboard is one offline HTML file.

## Turn it on
```json
// loopstack.json
{ "harnesses": ["claude"], "telemetry": true }
```
Run `loopstack sync` and commit. Sync then:
- adds one log step to `/amizing-mode` (about 300 bytes; the always-on block is unchanged);
- writes `.loopstack/dashboard.js`, so `/ls-usage-dashboard` works without the CLI;
- adds `.loopstack/runs.jsonl merge=union` to `.gitattributes`, so teammates' appends merge cleanly;
- adds `loopstack-dashboard.html` to `.gitignore`.

Each block sits between `# loopstack:start` and `# loopstack:end`. Your own lines are never touched.

Turn it off by removing the key (or setting it to `false`) and syncing. The step, script and blocks are removed. `runs.jsonl` stays as inert data; delete it if you want.

## View it
- In the agent: `/ls-usage-dashboard`. It is explicit-only and never runs by itself.
- From a shell: `loopstack dashboard`, or `node .loopstack/dashboard.js` in a repo with telemetry on.

```
loopstack dashboard [--dir <repo>]... [--out file.html] [--since 90d|12w|YYYY-MM-DD] [--json] [--by-member]
```
- **Team view.** Repeat `--dir` per repo, or list them in `loopstack-dashboard.json` (`{ "projects": ["../api", "../web"] }`) in the current directory.
- `--json` prints the aggregates, for agents and CI.
- `--by-member` splits by git author name (see Privacy).
- **CI.** Run `loopstack dashboard --dir . --out usage.html` in a job and keep `usage.html` as a build artifact. No server needed.

## Log schema (v1)
One JSON line per finished `/amizing-mode` task, in `.loopstack/runs.jsonl`:
```json
{"v":1,"ts":"2026-10-06T10:42Z","lvl":2,"lvl0":1,"route":"feature","skills":["requirements","plan","implement","test","review","verify"],"gates":{"testing":1},"loops":1,"unv":0,"learn":1,"ship":"pushed","h":"claude"}
```
| Field | Meaning |
|---|---|
| `v` | schema version (integer ≥ 1) |
| `ts` | UTC time; a date alone is accepted |
| `lvl` / `lvl0` | final / first size, 0–4 |
| `route` | bug, feature, incident, refactor, question; anything else counts as `other` |
| `skills` | skills run in the task |
| `gates` | failed gate → failure count; passing gates are omitted |
| `loops` | loop-backs (rework) |
| `unv` | UNVERIFIED items at the end |
| `learn` | lessons appended to `learnings.md` |
| `ship` | `none`, `committed`, `pushed` or `pr` |
| `h` | harness |
| `dur` | optional, minutes |

Readers ignore unknown fields and skip malformed lines. The dashboard shows how many it skipped. Lines with `v` > 1 are read if their v1 fields are valid.

## Metrics
| Metric | Definition |
|---|---|
| First-pass rate | tasks with no failed gate and no loop-back ÷ tasks |
| Rework rate | tasks with `loops` > 0 ÷ tasks |
| Gate failure rate | tasks with at least one failed gate ÷ tasks |
| Gate × level heat | tasks at level L where gate G failed ÷ tasks at level L |
| Sizing accuracy | `lvl0` × `lvl` matrix; off-diagonal cells are resized tasks |
| Ship funnel | tasks reaching at least committed, pushed, PR |
| Heavy skills on L0/L1 | L0/L1 tasks that ran architect, design, adr, research, security, performance, release, deploy or a multi-agent skill |
| Lessons per week | `- ` lines added to `.loopstack/learnings.md`, from git history |
| Version drift | `version` in each repo's manifest; missing = `pre-0.2` |

Insights are fixed rules, not an LLM. Each one shows its evidence. "Now" is the newest logged task, so the same data always gives the same output.

## Privacy and security
- The log holds enums, counts and timestamps only. It never holds prompts, code, paths, branch names, commit messages or identity.
- `--by-member` reads author **names** with `git blame` at render time. It never reads emails, shows per-person counts in alphabetical order (no ranking), and labels uncommitted lines `local`. It is off unless you pass the flag.
- The HTML has no external requests and a CSP that allows only its own hashed script. Log strings are escaped, rendered as text, and CSV exports are guarded against formula injection.
- Committed `runs.jsonl` is visible to everyone who can read the repo.

## Limits
- The data is self-reported by the agent; treat it as ASSUME.
- Skills invoked directly, without `/amizing-mode`, are not counted.
- No server, no cross-repo sync: the team view reads local clones.
- Not built yet: a Sankey of where failures loop back to (needs a per-loop field), incident MTTR, git backfill and token-cost estimates.
