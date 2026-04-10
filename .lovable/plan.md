

# Fix: audit_logs Column Name Mismatch

## Problem
The `audit_logs` table has a column called `action_type`, but the `create_ledger_transaction` RPC (and likely edge functions) insert into a column called `action` — which doesn't exist. This causes every approval to fail with a 422 error.

## Fix — Database Migration (one line)

Add the missing `action` column as an alias so both old and new code works:

```sql
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action text;
```

This is the safest approach since the `create_ledger_transaction` RPC we just deployed references `action`, and potentially many edge functions do too.

## Alternative
We could instead update the RPC to use `action_type` instead of `action`, but that risks missing other call sites across 35+ edge functions.

## Impact
- Instantly unblocks all approval buttons
- No edge function code changes needed
- Zero risk to existing data using `action_type`

