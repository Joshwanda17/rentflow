

# Fix: Income Statement Showing Zero Revenue

## The Problem
The Income Statement shows **zero revenue** (Access Fees, Request Fees, Other Service Income all USh 0) while correctly showing USh 67,500 in Platform Rewards costs — resulting in an incorrect Net Operating Income of -USh 67,500.

## Root Cause
The `general_ledger` table has a default `ledger_scope = 'wallet'`. The Income Statement **only queries platform-scoped entries**. Here's the mismatch:

- **Platform Rewards (67,500)**: The `process-supporter-roi` edge function **correctly** sets `ledger_scope: 'platform'` → appears in Income Statement ✓
- **Revenue entries (access fees, request fees)**: The `auto-charge-wallets` and `approve-deposit` edge functions do **NOT** set `ledger_scope` → defaults to `'wallet'` → **invisible** to Income Statement ✗

Revenue is being recorded in the ledger, but the Income Statement can't see it because it's in the wrong scope.

## Fix Plan

### 1. Fix Edge Functions — Set `ledger_scope: 'platform'` for Revenue Entries
Update these functions to explicitly tag revenue entries as platform-scoped:

- **`auto-charge-wallets/index.ts`** — All `tenant_access_fee` ledger inserts (3 locations around lines 301, 417, and similar) need `ledger_scope: 'platform'`
- **`approve-deposit/index.ts`** — The `tenant_access_fee` prepaid ledger insert (line 327) needs `ledger_scope: 'platform'`
- **`approve-wallet-operation/index.ts`** — The generic ledger insert (line 133) should set `ledger_scope` based on the operation category (revenue categories → `'platform'`, wallet deposits → `'wallet'`)

### 2. Backfill Existing Ledger Data via Migration
Create a migration to reclassify existing revenue entries that were incorrectly scoped:

```sql
UPDATE general_ledger 
SET ledger_scope = 'platform'
WHERE ledger_scope = 'wallet'
  AND category IN (
    'tenant_access_fee', 'tenant_request_fee', 
    'platform_service_income', 'landlord_platform_fee',
    'management_fee', 'rent_repayment'
  )
  AND direction = 'cash_out'
  AND source_table = 'subscription_charges';
```

Also backfill any platform cash_in entries for fees that should be platform-scoped.

### 3. Verify `approve-wallet-operation` Scope Logic
Add scope-awareness so when the CFO approves operations, the ledger entry gets the correct scope:
- Revenue categories (`roi_payout`, `supporter_platform_rewards`, etc.) → `'platform'`
- User wallet operations (deposits, withdrawals) → `'wallet'`
- Capital flows → `'bridge'`

## Impact
After this fix, the Income Statement will correctly show tenant access fees, request fees, and other platform revenue — giving an accurate Net Operating Income figure.

