---
name: requirements
description: Turn intent into testable requirements, acceptance criteria, business rules and edge cases.
---
# /requirements
- Clarify gaps and conflicts with batched questions. User unavailable → mark ASSUME, never fill silently.
- Functional; non-functional with numbers (performance, security, availability, accessibility, compliance).
- User stories (As a / I want / so that); use cases for multi-step flows.
- Acceptance criteria as Given/When/Then, each observable.
- Business rules, edge cases, error scenarios, constraints, dependencies, assumptions, risks.
Per AC: can a test prove pass/fail? No → rewrite.
Templates: `.amizloop/templates/requirements.md`, `.amizloop/templates/user-story.md`, `.amizloop/templates/acceptance-criteria.md`.
