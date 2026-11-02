# 0002. Opt-in-by-signal formal checks and TLA+ statecharts
Status: accepted · Date: 2026-11-02

Context: pstack added `/create-formal-verification-skill`, `/maintain-formal-verification-skill` and `/statechart`. They catch bugs that tests rarely reach (bad event orders, retries, leases, protocol races) and show a state flow to the person who owns it, with the shortest path to each broken rule. pstack's statechart engine is about 5k lines of TypeScript plus tests, and it installs Java and TLC through mise.

Problem: bring the same capability to loopstack without breaking its standards. That means small skills, zero dependencies, every harness, one `sync` to upgrade, and process proportional to risk.

Constraints: skills ≤1.6 KB; always-on block unchanged except the skill index; no runtime dependencies; no auto-download of executables; must not run on ordinary tasks; `/amizing-mode` must pick it up when the task needs it.

Options:
1. Port pstack's engine — every feature (regions, mayBreak marks, bounded reruns) / thousands of lines, a TypeScript runtime and mise; violates zero-dep and proportionality.
2. Skills only; the agent runs TLC and draws the chart by hand — tiny / the chart can drift from the checked model, which defeats the purpose.
3. Two skills plus a ~360-line runner using Node builtins only (`bin/statechart.js`), which runs TLC and draws the chart deterministically — the chart comes from the checked graph, plus the shortest path per rule / no parallel regions, mayBreak or group colours.
4. Explicit-only skills (as in pstack) — never misfire / `/amizing-mode` could not use them, which the user asked for.

Decision:
- Option 3. `/formal` merges create and maintain into one skill. `/statechart` drives the runner. Both are auto-invocable, but `/amizing-mode` adds them only on signal: costly ordering, concurrency, retry, lease or state-machine logic that tests rarely reach; an explicit request to prove or model-check; or a flow someone must sign off. Never for CRUD, glue or UI. `/design` points to them.
- pstack's generated project-local verify skill becomes a loopstack **gate**, `.loopstack-local/gates/formal-<area>.md`, from `templates/formal-gate.md`. Sync already ships gates to every harness, and `/verify` and `/amizing-mode` already apply them, so drift detection needs no new mechanism. The gate records the covered code, the command, the bounds, the known findings and the sync commit.
- The runner is copied to `.loopstack/statechart.js` on sync (like `dashboard.js`), whenever the `statechart` skill is present. It invokes TLC exactly as pstack does (`-tool -workers 1 -fp 0 -lncheck final`, from a temp dir with `-DTLA-Library`). It reruns without each broken rule, splits temporal properties one by one, and draws a chart only for a complete graph of ≤500 states.
- TLC is never downloaded automatically. The runner looks for `$TLA2TOOLS` or `~/.loopstack/tla2tools.jar` and prints the pinned v1.7.4 URL and sha256 (the same pin as pstack) when the jar is missing.
- The `amizing-mode` budget rises from 3000 to 3400 B: the trigger line costs about 250 B, and telemetry adds about 300 B on top. Other skill budgets stay at 1.6 KB.

Consequences (+/−):
- + Rare, high-value checks are available on every harness, and the token cost appears only when a signal fires. The chart and report cannot drift from the checked model.
- + A formal check keeps working after hand-off: the gate makes `/verify` rerun it and flag drift when the covered code changes.
- − The chart is flat. Parallel regions show as combined labels such as "Playback Stopped, Volume Loud", so busy models need a coarser `view`. A state is marked where TLC's shortest counterexample ends, not at every state that breaks the rule.
- − Needs Java 11+ and a manually fetched jar. A model with no bound can run until `--timeout` (300 s by default).
- − The always-on skill index grows by two names on non-Claude harnesses, and Claude sees two more skill descriptions.

Revisit when: users need parallel regions or full breaks/mayBreak marks (port pstack's region and mark passes); teams want TLC fetched automatically (add a checksum-verified fetch command); or `/formal` fires on tasks that do not need it (tighten the trigger).
