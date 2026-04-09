

# Fix Empty String Reference ID — Final Hardening

## Problem

Line 256 of the current `create_ledger_transaction` RPC:

```sql
COALESCE(idempotency_key, entry->>'reference_id', '')
```

When both `idempotency_key` and `entry->>'reference_id'` are NULL, this defaults to `''` (empty string). All keyless transactions then share the same `reference_id = ''`, which means:
- Advisory lock on `hashtext('')` would serialize **all** keyless transactions against each other
- The idempotency SELECT could match unrelated transactions

## Current State (Already Correct)

- **Lock order**: Advisory lock fires BEFORE the SELECT lookup (lines 154-155) — no change needed
- **Deterministic ORDER BY**: Already present — no change needed

## Change

### 1 database migration

Replace the empty-string fallback with NULL:

```sql
-- Line 256 changes from:
COALESCE(idempotency_key, entry->>'reference_id', '')
-- To:
COALESCE(idempotency_key, NULLIF(entry->>'reference_id', ''))
```

This ensures:
- With a key → deterministic idempotency (lock + dedup)
- Without a key → `reference_id = NULL`, no collision, independent execution

Single line change in the RPC function body. No other files affected.

