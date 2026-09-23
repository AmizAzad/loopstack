---
name: refactor
description: Improve structure without changing behaviour, in small test-verified steps.
---
# /refactor
- Justify: the pain removed (change cost, bugs, readability). Never inside an unrelated task.
- Pin behaviour: area tests pass first; add characterization tests if missing.
- Small steps (rename, extract, move, inline); run tests after each.
- No behaviour, API or output change. Separate refactor commits from feature commits.
- Large → incremental path (strangler, branch by abstraction), not big bang.
