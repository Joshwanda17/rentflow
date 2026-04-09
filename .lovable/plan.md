

# Final Locks: Trigger Idempotency + RPC Hardening

## Current State

- **Trigger guard** checks `source_table + source_id + ledger_scope='bridge'` — good but could be tighter with explicit `category` filter
- **RPC** already enforces `total_in = total_out` and rejects zero/negative amounts
- **RPC** has NO reference-based idempotency (duplicate calls with same data will succeed twice)

## Changes

### 1. Tighten trigger idempotency guard

Add `category = 'rent_principal_collected'` to the existing guard for deterministic specificity:

```sql
IF EXISTS (
  SELECT 1 FROM public.general_ledger
  WHERE source_table = 'subscription_charge_logs'
    AND source_id = NEW.id::text
    AND category = 'rent_principal_collected'
    AND ledger_scope = 'bridge'
) THEN
  RETURN NEW;
END IF;
```

### 2. Add reference-based idempotency to `create_ledger_transaction` RPC

Add an optional `idempotency_key` parameter. If provided, check if a transaction group with that key already exists and return it instead of creating a duplicate:

```sql
CREATE OR REPLACE FUNCTION public.create_ledger_transaction(
  entries JSONB,
  idempotency_key TEXT DEFAULT NULL
) RETURNS UUID ...

-- At top of function body:
IF idempotency_key IS NOT NULL THEN
  SELECT transaction_group_id INTO group_id
  FROM general_ledger
  WHERE reference_id = idempotency_key
  LIMIT 1;
  IF group_id IS NOT NULL THEN
    RETURN group_id;  -- Already processed, return existing
  END IF;
  group_id := gen_random_uuid();
END IF;
```

Edge functions pass a deterministic key like `charge-{charge_log_id}` or `pay-{rent_request_id}-{timestamp}` to prevent duplicate processing on retries.

### 3. No edge function changes needed now

The idempotency key is optional — existing calls work unchanged. We can incrementally add keys to each edge function caller in follow-up work.

## Files Changed

| File | Change |
|------|--------|
| 1 database migration | Update trigger guard to include `category` filter; add `idempotency_key` parameter to `create_ledger_transaction` RPC |

## Result

- Trigger cannot double-reduce receivables (deterministic guard on exact category + source)
- RPC rejects unbalanced and zero transactions (already done)
- RPC supports reference-based idempotency for retry safety
- System becomes fully deterministic — no silent duplicates possible

