

# Add UNIQUE Constraint on reference_id — Close Race Condition

## Problem

The RPC idempotency check uses a SELECT before INSERT. Two parallel requests can both pass the SELECT and both insert, creating duplicate transactions. Application-level checks are necessary but insufficient — a database-level constraint makes it physically impossible.

## Change

### 1 database migration

Add a partial unique index on `general_ledger.reference_id` where it is not null:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS unique_reference_id
ON public.general_ledger(reference_id)
WHERE reference_id IS NOT NULL;
```

This ensures that even under concurrent execution, only one transaction with a given `reference_id` can ever be committed. The second parallel request will hit a unique violation, which the RPC can catch gracefully.

No edge function or trigger changes needed — the existing RPC logic already sets `reference_id = idempotency_key`, so this index enforces what the code already intends.

## Result

- Race condition eliminated at the database level
- Duplicate money creation becomes physically impossible
- System reaches 100% deterministic financial integrity

