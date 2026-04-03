

# Fix: Income Statement Showing Zero Revenue

## Summary
The edge function fixes (setting `ledger_scope: 'platform'` on revenue inserts) were already applied in the previous attempt. However, the **data backfill migration was never executed** because the implementation was cancelled mid-way. There are still 14 `tenant_access_fee` entries and 132 `rent_repayment` entries incorrectly scoped as `'wallet'` in the database.

## Current State
- `auto-charge-wallets` — already has `ledger_scope: 'platform'` on fee inserts
- `approve-deposit` — already has `ledger_scope: 'platform'` on fee insert
- `approve-wallet-operation` — already has category-based scope resolution logic
- **Database** — 14 `tenant_access_fee` (USh 115,088) and 132 `rent_repayment` entries still scoped as `'wallet'`

## What Needs to Be Done

### 1. Backfill Migration (the missing piece)
Run a migration to reclassify existing revenue entries. Must temporarily disable the ledger mutation trigger:

```sql
-- Temporarily allow updates
ALTER TABLE public.general_ledger DISABLE TRIGGER prevent_ledger_mutation_trigger;

-- Reclassify revenue entries
UPDATE general_ledger 
SET ledger_scope = 'platform'
WHERE ledger_scope = 'wallet'
  AND category IN (
    'tenant_access_fee', 
    'tenant_request_fee', 
    'platform_service_income', 
    'landlord_platform_fee',
    'management_fee', 
    'rent_repayment'
  );

-- Re-enable protection
ALTER TABLE public.general_ledger ENABLE TRIGGER prevent_ledger_mutation_trigger;
```

This single migration is the only remaining step. No code changes needed — all edge functions are already fixed.

## Impact
- 14 access fee entries (USh 115,088) and 132 rent repayment entries (USh 3,256,567) will become visible to the Income Statement
- Revenue will display correctly, producing an accurate Net Operating Income

## Technical Details
- **Files changed**: None (edge functions already updated)
- **Migration**: 1 new SQL migration to backfill `ledger_scope`
- The mutation trigger must be disabled/re-enabled within the migration since the ledger is append-only by design

