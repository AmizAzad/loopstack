---
name: ls-usage-dashboard
description: Explicit only. Render the loopstack usage dashboard - task sizes, gate failures, rework, skills.
explicit: true
---
# /ls-usage-dashboard
Run only when the user invokes it. Usage capture is off unless `loopstack.json` has `"telemetry": true`.
1. `.loopstack/dashboard.js` missing → capture is off. Tell the user: set `"telemetry": true` in `loopstack.json`, run `loopstack sync`, commit; each later /amizing-mode task appends one line to `.loopstack/runs.jsonl`. Stop.
2. Run `node .loopstack/dashboard.js` plus only the options the user asked for: `--dir <repo>` (repeat for a team view), `--since 90d`, `--by-member` (per-person split; only on explicit request), `--json` (numbers instead of HTML). Default output: `loopstack-dashboard.html`.
3. Report the command's summary line and the file path; suggest opening it in a browser.
Never read or paste the HTML or `runs.jsonl` into the conversation (token cost); answer questions from `--json`.
