---
name: test
description: Choose the lowest test level that proves behaviour, write the tests, run them.
---
# /test
Lowest level that proves the behaviour; go higher only for integration risk.
| Need | Level |
|------|-------|
| logic, edge cases | unit |
| wiring with DB, queue, fs | integration/component; DB tests on real engine (container) |
| service contract | API / contract (consumer-driven if many consumers) |
| critical user journey | e2e / UI, few |
| fixed bug | regression test that failed before |
| after deploy | smoke |
| latency, throughput, capacity | performance, load/stress → /performance |
| abuse | authz, injection, fuzz, dependency scan → /security |
| UI access | accessibility (axe, keyboard, screen reader) |
| versions, browsers, platforms | compatibility |
| schema/data change | migration up+down on realistic data |
| resilience | failure injection, restore/DR drill |
Rules: behaviour not internals; deterministic (no sleeps; fixed clock/seed); one reason to fail; descriptive names; cover error paths.
Run; report counts and failures verbatim. L3+: `.loopstack/templates/test-plan.md`.
