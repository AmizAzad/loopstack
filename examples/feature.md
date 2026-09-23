# Example: feature (L3)
Illustrative trace, not a recorded run.

> Add CSV export of invoices for accounting.

- **Intake** (questions asked together): Maximum rows? Which columns? Immediate download or emailed? → Up to 200k rows, async with an emailed link.
- **Size**: L3 (new async job, new endpoint, PII). Read `.amizloop/learnings.md` first.
- **/requirements**: 5 Given/When/Then ACs. NFRs: 200k rows in under 2 min; link expires after 24 h.
- **/research**: FACT: reports already use the job runner `jobs/Queue.ts:12`. FACT: `csv-stringify` is already a dependency. REC: reuse both.
- **/design + /api**: `POST /invoices/exports` returns 202 with an export id. Status endpoint. Signed URL. Idempotency key.
- **/security**: tenant-scoped authorization, 24 h signed URL, audit log entry because the export contains PII.
- **/plan**: 6 steps → **/implement** + **/test** (mapper unit tests, job integration test, API contract test).
- **/review**: IMPORTANT: unbounded query. Fixed with cursor batching.
- **/performance**: 200k rows took 71 s locally (target 120 s).
- **/verify**: 5/5 ACs VERIFIED with test output. UNVERIFIED: email delivery in staging (needs SMTP credentials).
- **/release + /deploy**: behind flag `invoiceExport`, canary. **/observe**: `export_duration_seconds` metric, alert on failure rate.
- **Learn**: appended "Queue jobs need explicit tenant context" to learnings.md.
