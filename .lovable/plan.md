

# Harden RPC Idempotency — Final Tightening

## Changes

### 1 database migration

Update `create_ledger_transaction` with two small fixes:

**a) NULL key guard** — already present (`IF idempotency_key IS NOT NULL`), no change needed.

**b) Deterministic lookup** — add `ORDER BY created_at ASC` to the existing idempotency SELECT:

```sql
-- Line 36-39 becomes:
SELECT transaction_group_id INTO group_id
FROM public.general_ledger
WHERE reference_id = idempotency_key
ORDER BY created_at ASC
LIMIT 1;
```

This guarantees a consistent `group_id` is returned even in edge cases where multiple rows share a `reference_id`.

## Scope

- Single migration, single function change (one line added)
- No edge function or trigger changes

