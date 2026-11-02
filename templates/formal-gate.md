# Gate: formal-<area>
Applies when a change touches: <files and functions the model covers>
Promise: <one plain sentence> · Harm if broken: <one sentence>
Model: <path> · Tool: <tool + version> · Bounds/assumptions: <…> · Not covered: <…>
Run: `<one command>` → exit 0 holds, 1 breaks, 2 error
Known findings: <none | rule + counterexample summary>
Synced at: <commit> (model last confirmed to describe the code)
Pass: holds, or fails only on known findings.
Covered code changed since sync → run /formal drift before judging; move "Synced at" only when the model matches.
Fail → replay the counterexample in real code: a step that cannot happen = model error, fix the model; otherwise bug → loop back.
