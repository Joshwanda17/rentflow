

## Fix: Wallet Retractions Not Appearing on CFO Dashboard

### Root Cause
The `wallet_deductions` table has **no foreign keys** to `profiles`. The query in `WalletRetractionsFeed.tsx` uses PostgREST foreign-key join syntax (`profiles!wallet_deductions_target_user_id_fkey(...)`) which silently fails because those constraints don't exist.

### Fix

**1. Add foreign keys — Database migration**

```sql
ALTER TABLE public.wallet_deductions
  ADD CONSTRAINT wallet_deductions_target_user_id_fkey
    FOREIGN KEY (target_user_id) REFERENCES public.profiles(id);

ALTER TABLE public.wallet_deductions
  ADD CONSTRAINT wallet_deductions_deducted_by_fkey
    FOREIGN KEY (deducted_by) REFERENCES public.profiles(id);
```

This allows the existing PostgREST join syntax in the component to work without any code changes.

**2. No component changes needed**

The query in `WalletRetractionsFeed.tsx` is already correct — it just needs the foreign keys to exist for the join syntax to resolve.

### Files Changed

| File | Change |
|------|--------|
| Database migration | Add two foreign key constraints to `wallet_deductions` |

