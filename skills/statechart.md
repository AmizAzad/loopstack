---
name: statechart
description: Check a TLA+ state model and draw it as a Mermaid statechart with the shortest path to each bug.
---
# /statechart
Use when someone must see or sign off how a flow moves between states, or to show a /formal counterexample.
1. Spec in a scratch folder (or the /formal model dir): `Spec.tla` + `Spec.cfg`. Each rule the reader agrees to = INVARIANT (add a variable if needed; never weaken one). `Next` = disjunction of named actions. Correct end states: `Done == <end> /\ UNCHANGED vars` in `Next`. Small constants or a CONSTRAINT.
2. Optional `view.mjs` in reader words, no variable names: `state(v)` → label (merge states that act the same); `step(action, from, to)` → "you press play [while loading]", or null to hide; `title`. Aim ≤20 arrows. Never merge states that break different rules; keep every state reachable.
3. `node .loopstack/statechart.js Spec.tla [--view view.mjs] [--out dir]`: 0 all hold · 1 rule breaks · 2 error. Needs Java 11+ and tla2tools.jar: `$TLA2TOOLS` or `~/.loopstack/tla2tools.jar`; `--help` gives the pinned URL + sha256. Verify the checksum before first use.
4. Show `chart.mmd` as a mermaid block. Per bug: rule, reader sentence, numbered path from `report.md`. Say what the model and chart leave out (hidden steps, bounds).
5. Model describes code → replay each path in the real code before calling it a bug.
