---
name: review
description: Review a change rigorously; findings tagged BLOCKING, IMPORTANT, SUGGESTION or NIT.
---
# /review
Read the full diff plus enough context to judge it. Check what applies:
correctness · requirements met · design/architecture fit · readability · maintainability · error handling · security · performance · concurrency · data integrity · API compatibility · DB impact · test quality (would tests fail if code broke?) · observability · deployment impact · docs.
Finding format: `SEVERITY file:line — problem → fix`
- BLOCKING: bug, security hole, data loss, broken contract, missing required test.
- IMPORTANT: fix before merge (risk, maintainability).
- SUGGESTION: optional improvement.
- NIT: trivial/style.
Real issues only; "no findings" is a valid result. Self-review your own changes the same way before calling them done.
Formal: `.loopstack/templates/review.md`.
