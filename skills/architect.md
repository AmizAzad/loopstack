---
name: architect
description: Choose system structure proportional to the problem and explain the trade-offs.
---
# /architect
1. Drivers: key requirements, quality attributes (scale, latency, availability, security, cost, team size, change rate), constraints.
2. Start from the existing architecture; change it only for a driver.
3. Styles, only where they fit: layered · modular monolith · hexagonal/clean · DDD (complex domain) · event-driven (async, decoupled) · CQRS (divergent read/write) · microservices (independent scaling/teams; rarely first).
4. Principles are tools, not rules: SOLID, separation of concerns, high cohesion/low coupling, dependency inversion at boundaries, DRY for knowledge (not coincidence), KISS, YAGNI.
5. Per option: fit, cost, risk, reversibility. Choose; say why others lost.
6. Hard to reverse → /adr. Close call → suggest /arena.
Output: context diagram (mermaid/text), components & responsibilities, key flows, trade-offs. Template: `.amizloop/templates/architecture.md`.
