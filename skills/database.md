---
name: database
description: Schema, indexes, transactions and production-safe migrations and backfills.
---
# /database
- Schema: normalize by default; integrity in the DB (PK, FK, NOT NULL, UNIQUE, CHECK); right-sized types.
- Indexes for real query patterns; confirm with EXPLAIN; weigh write cost.
- Transactions: smallest scope; deliberate isolation level; avoid long locks; retry deadlock/serialization failures idempotently; optimistic locking under contention.
Migrations are production changes:
- Expand → migrate → contract; app versions N and N+1 both work.
- Large tables: lock/rewrite risk → online DDL, concurrent index builds.
- Backfills batched, resumable, throttled, observable.
- Tested rollback (down migration or forward fix); backup before destructive steps.
- Test up/down on production-like volume. Verify after: counts, checksums, invariant queries.
