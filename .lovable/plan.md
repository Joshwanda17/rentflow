

## Fix: Double-Credit Bug on Deposit Approval

### Root Cause

When a deposit is approved, the wallet gets credited **twice**:

1. **Manual credit** in `approve-deposit` edge function (lines 129-146): reads wallet balance, adds deposit amount, writes new balance.
2. **Trigger chain**: The same function updates `deposit_requests.status = 'approved'` → DB trigger `trg_deposit_to_ledger` fires → inserts a `cash_in` ledger entry → DB trigger `sync_wallet_from_ledger` fires → credits wallet **again**.

The manual credit was written when `sync_wallet_from_ledger` only fired for entries with `transaction_group_id`. A recent migration (`20260407121146`) removed that guard, making the trigger fire on ALL ledger inserts. The manual credit was never removed, resulting in a double-credit.

### Fix

**Remove the manual wallet credit** from `supabase/functions/approve-deposit/index.ts` (lines 128-146). The trigger chain already handles it correctly:

- `deposit_requests` status → `approved`
- `trg_deposit_to_ledger` → inserts `cash_in` ledger entry
- `sync_wallet_from_ledger` → credits wallet

The manual upsert/read/update block should be deleted entirely. The subsequent code that reads `walletAfterCredit` (line 157-161) should remain but will now read the trigger-updated balance.

### Changes

**File: `supabase/functions/approve-deposit/index.ts`**
- Remove lines 128-146 (manual wallet credit block)
- Keep the wallet upsert on line 129-131 (ensure wallet row exists) but remove the balance manipulation on lines 133-146

### Risk Assessment
- Low risk: the trigger chain is proven (all other deposit categories use it)
- The auto-repayment, debt clearance, and prepay logic downstream is unaffected — it reads fresh wallet balance after the trigger fires

