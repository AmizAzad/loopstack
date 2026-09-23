---
name: debug
description: Find a bug's root cause by reproduction and evidence, then fix it with a regression test.
---
# /debug
1. Reproduce: exact input/steps, expected vs actual. Can't → collect logs, traces, versions, data.
2. Minimize to the smallest failing case; make it a failing test when feasible.
3. Hypotheses ranked by likelihood (HYPO).
4. Test cheaply: logs, debugger, `git bisect`, diff working vs broken.
5. Confirm root cause with evidence; ask "why" until the cause is actionable, not a symptom.
6. Fix it (/implement); add regression test; look for the same bug elsewhere.
Never "fix" by suppressing errors, adding retries or sleeps you can't explain.
