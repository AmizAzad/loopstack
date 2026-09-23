---
name: bdd
description: Specify behaviour as Feature/Scenario Given-When-Then in domain language and automate it.
---
# /bdd
Use for user-facing behaviour, business rules and cross-team contracts needing shared language.
1. Feature: capability + value.
2. Scenarios: happy path, key edge cases, errors; one behaviour each.
3. Given (context) / When (one action) / Then (observable outcome). Domain words, no UI mechanics. Examples table for data variants.
4. Automate with the project's BDD tool (Cucumber, SpecFlow, pytest-bdd, behave…) or plain tests named after scenarios.
