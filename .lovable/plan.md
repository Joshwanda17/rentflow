

## Fix: Drop the correct old overload of `credit_agent_rent_commission`

### Problem
The migration we created to drop the old overload targeted the wrong type signature:
- We dropped: `(uuid, numeric, text, text)` — this signature never existed
- What actually exists: `(uuid, numeric, text, uuid)` — with `p_source_id` as `uuid`, not `text`

So the old function is still alive in the database, and when `agent-deposit` calls with 3 `uuid` args, Postgres may be hitting ambiguity or the old overload is interfering, causing the commission RPC to fail with "Rent balance reduced, but commission credit failed."

### What to do

**1. New migration: drop the correct old overload**

```sql
DROP FUNCTION IF EXISTS public.credit_agent_rent_commission(uuid, numeric, text, uuid);
```

This removes the 4-param version `(p_rent_request_id uuid, p_repayment_amount numeric, p_source_table text, p_source_id uuid)` that uses flat UGX 10,000 commission and old idempotency logic.

The surviving 3-param version `(uuid, numeric, uuid)` with 10% rate and proper double-entry remains the sole implementation.

**Files**: One new migration file only. No edge function changes needed — the callers are already correct from the previous fix.

