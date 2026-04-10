

# Fix: Drop Overloaded RPC to Resolve PGRST203

## Problem
The `create_ledger_transaction` function has two overloaded signatures. PostgREST can't disambiguate them, breaking all financial approvals with error `PGRST203`.

## Fix
One database migration:
```sql
DROP FUNCTION IF EXISTS public.create_ledger_transaction(jsonb);
```

The remaining signature `create_ledger_transaction(entries jsonb, idempotency_key text DEFAULT NULL)` handles both cases. No edge function code changes needed.

## Impact
Instantly fixes all Approve/Reject buttons across Financial Ops, Manager dashboard, and CFO queues.

## Risk
None — the two-parameter version with `DEFAULT NULL` already accepts calls without an idempotency key.

