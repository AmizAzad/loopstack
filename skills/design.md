---
name: design
description: Technical design for a change - components, interfaces, data, errors, security, observability.
---
# /design
Cover only what the change touches:
- Components/modules, responsibilities, interfaces; API contracts → /api.
- Data: schema, queries, transactions, concurrency, migrations → /database.
- Caching (invalidation), messaging (delivery semantics, ordering, idempotency, retries).
- Validation, error handling (what fails, how surfaced, retry/fallback), configuration.
- Security → /security when authn/z, input, secrets or PII are involved.
- Logging, metrics, tracing, alerts for new paths.
- Performance budget; failure modes (timeouts, partial failure, backpressure).
- UI → /frontend.
Diagram flows when it clarifies (mermaid sequence). Note rejected alternatives.
Template: `.amizloop/templates/design.md`.
