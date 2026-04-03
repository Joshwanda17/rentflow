

## Fix: CFO Financial Statements Empty Due to RLS

### Root Cause
The `general_ledger`, `wallets`, and `rent_requests` tables have SELECT policies that only allow the `manager` role to view all rows. The CFO role has **no access** to any of these tables, so every query returns empty arrays and all financial statements show zeros.

### Fix — Database Migration

Add SELECT policies for executive roles (`cfo`, `coo`, `ceo`) on the three tables used by the financial statements generator:

```sql
-- general_ledger: Allow executives to view all entries
CREATE POLICY "Executives can view all ledger entries"
  ON public.general_ledger FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'cfo'::app_role) OR
    public.has_role(auth.uid(), 'coo'::app_role) OR
    public.has_role(auth.uid(), 'ceo'::app_role)
  );

-- wallets: Allow executives to view all wallets
CREATE POLICY "Executives can view all wallets"
  ON public.wallets FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'cfo'::app_role) OR
    public.has_role(auth.uid(), 'coo'::app_role) OR
    public.has_role(auth.uid(), 'ceo'::app_role)
  );

-- rent_requests: Allow executives to view all requests
CREATE POLICY "Executives can view all rent requests"
  ON public.rent_requests FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'cfo'::app_role) OR
    public.has_role(auth.uid(), 'coo'::app_role) OR
    public.has_role(auth.uid(), 'ceo'::app_role)
  );
```

### Why This Is Safe
- Uses the existing `has_role()` security-definer function (no recursive RLS)
- Only grants SELECT (read-only) — no INSERT/UPDATE/DELETE
- Limited to three specific executive roles that need financial oversight
- Consistent with the existing `manager` policy pattern

### Files Changed

| File | Change |
|------|--------|
| Database migration | Add 3 SELECT policies for executive roles |

No code changes needed — the hook and component are correct; they just get empty data due to RLS.

