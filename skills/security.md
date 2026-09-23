---
name: security
description: Threat-model a change and check it against OWASP-class risks, secrets, deps and privacy.
---
# /security
Threat model (L3+ or sensitive): assets, actors, entry points, trust boundaries; STRIDE per boundary; mitigations.
Check what applies:
- Authentication; authorization on every path (object-level, least privilege).
- Allow-list input validation, output encoding; injection (SQL/NoSQL/OS/template), XSS, CSRF, SSRF, path traversal, unsafe deserialization.
- Secrets never in code, logs or repo; secret manager; rotation.
- TLS in transit; encryption at rest for sensitive data; vetted crypto libraries only.
- Dependencies & supply chain: known CVEs, pinned versions, provenance; new deps justified.
- Privacy: PII minimization, retention, consent, log redaction.
- Audit logs for security-relevant actions; secure defaults and config.
Refs: OWASP Top 10, ASVS, API Security Top 10. Run available scanners (SAST, dependency audit, secret scan); report actual output.
Severities as /review. Template: `.amizloop/templates/security-review.md`.
