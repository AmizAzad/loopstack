---
name: understand
description: Map existing code before changing it - structure, callers, data, contracts, tests, blast radius.
---
# /understand
Depth ∝ task level; stop once the change is safe to make. Search, don't guess.
Repo (first contact or L3+): layout, apps/services, modules, dependencies, build, runtime, config, DB, APIs/events, auth, integrations, tests, CI/CD, deploy, observability. Start from README, manifests, CI config.
Target code, answer:
- What calls this? What does it call?
- What data does it read or modify?
- Which contracts (API, schema, events, config) does it use or expose?
- What depends on it?
- What tests cover it? (run them if cheap)
- What could this change break?
Note conventions to follow (naming, errors, logging, test style).
Output ≤15 lines: affected components, facts vs assumptions, risks, open questions.
