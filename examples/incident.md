# Example: production incident (L4)
Illustrative trace, not a recorded run.

> Checkout p95 latency has been 8 s since 14:05. Error rate 12%.

No command given, so the task goes through `/amizing-mode`.

- **/incident**: sev2. Mitigate first. Deploy v2.31 at 14:02 lines up with the start. The user approves a rollback.
- **/rollback**: redeployed v2.30. Dashboard shows p95 and error rate back to baseline at 14:31.
- **/investigate**: FACT: v2.31 added `ORDER BY created_at` on `orders`, and that column has no index. EXPLAIN confirms a sequential scan over 4M rows.
- **Corrective actions**: **/database** builds the index concurrently and tests the migration on a production-size copy. **/test** adds a query-plan check to CI. **/observe** adds an alert on p95 > 2 s.
- **Postmortem** from the template. Learning: "EXPLAIN new queries on large tables during review."
