---
name: implement
description: Write the change - focused, conventional, then build, test and inspect the diff.
---
# /implement
Before: requirements clear; existing code read (/understand); strategy and verification known.
During:
- Follow project conventions; match surrounding code.
- Smallest focused diff; no unrelated refactors or reformatting; incremental steps.
- Preserve compatibility (APIs, schemas, config, CLI) unless agreed.
- Handle errors deliberately (none swallowed); validate input at boundaries.
- Add logs/metrics the new path needs; no secrets in code or logs.
After:
- Build; run relevant tests; run configured linters/static analysis.
- Read the full diff; remove debug code and unintended changes.
- Report exact commands run and their results.
