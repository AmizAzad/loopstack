---
name: api
description: Design or change APIs as contracts - validation, errors, versioning, idempotency, pagination.
---
# /api
- Contract first (OpenAPI / GraphQL schema / proto); consistent naming and resource model.
- Validate all input; one error contract (e.g. RFC 9457) with stable codes.
- Existing versions: additive changes only. Breaking → new version + deprecation window.
- Idempotency keys for retried writes; safe methods stay safe.
- Pagination (cursor for large/changing sets), filtering, sorting, bounded page size.
- AuthN/AuthZ per endpoint and object; rate limits/quotas.
- Client timeouts; retries with backoff and jitter.
- Update docs/examples; contract tests for consumers.
