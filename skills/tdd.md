---
name: tdd
description: Red-green-refactor for logic with clear expected behaviour, including bug reproduction.
---
# /tdd
Use for well-specified logic, bug fixes (reproduce first), algorithms. Skip for spikes, glue, pure layout.
Per behaviour:
1. RED: smallest failing test; run; confirm it fails for the right reason.
2. GREEN: minimal code to pass; run tests.
3. REFACTOR: clean up, tests green, behaviour unchanged.
Test through public interfaces, not internals. Keep cycles small. Show red and green output as evidence.
