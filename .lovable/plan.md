

# Fix: Ambiguous `record_rent_request_repayment` Function Overload

## Root Cause

There are **two overloads** of `record_rent_request_repayment` in the database:

1. `(p_tenant_id uuid, p_amount numeric)` — old version, no transaction_group_id
2. `(p_tenant_id uuid, p_amount numeric, p_transaction_group_id uuid DEFAULT NULL)` — new version with optional group ID

When called with 2 arguments (as the `agent-deposit` edge function does), PostgreSQL cannot decide which to use and throws: **"function is not unique"**. This is what causes the "Failed to reduce tenant rent balance" error.

## Fix

**Database migration**: Drop the old 2-parameter overload, keeping only the 3-parameter version (which has a DEFAULT NULL for the third param, so 2-arg calls will work once the ambiguity is removed).

```sql
DROP FUNCTION IF EXISTS public.record_rent_request_repayment(uuid, numeric);
```

This single SQL statement resolves the issue. The remaining 3-param version with `DEFAULT NULL` will accept both 2-arg and 3-arg calls.

## Impact

- **agent-deposit** edge function: will work again (no code change needed)
- **tenant-pay-rent** edge function: also calls this RPC with 2 args — will also be fixed
- **approve-wallet-operation**: same fix applies
- No edge function or frontend code changes required

