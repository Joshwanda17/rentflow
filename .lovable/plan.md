

# Fix Plan: Tenant Pay Rent Flow — 3 Critical Issues

## Issues to Fix

### 1. Wrong Ledger Category (Critical)
- `tenant-pay-rent/index.ts` uses `category: 'tenant_repayment'` — this category doesn't exist in the system
- Must change to `'rent_repayment'` to match the 149 existing entries and ensure financial reports capture these payments

### 2. Agent Commission Scope Bug (Critical)
- The `credit_agent_rent_commission` RPC writes commission entries with `ledger_scope: 'bridge'`
- The `sync_wallet_from_ledger` trigger only processes `ledger_scope: 'wallet'` entries
- Result: agents earn commission on paper but it never credits their wallet balance
- Fix: Update the RPC or the edge function commission call to use `wallet` scope

### 3. Missing Idempotency Key (Medium)
- No idempotency key is passed to `create_ledger_transaction`, so rapid double-taps on the Pay Rent button can create duplicate payments
- Fix: Generate a deterministic idempotency key like `tenant-pay-{rentRequestId}-{amount}-{timestamp_rounded_to_minute}`

## Files to Change

1. **`supabase/functions/tenant-pay-rent/index.ts`**
   - Change `category: 'tenant_repayment'` → `'rent_repayment'` (both entries, lines 127 and 140)
   - Add `idempotency_key` parameter to the `create_ledger_transaction` call

2. **Database migration** — Fix `credit_agent_rent_commission` RPC
   - Investigate the RPC source to confirm the `bridge` scope issue
   - Update commission entries to use `ledger_scope: 'wallet'` so they actually credit agent ballets
   - Or add a paired wallet-scope entry alongside the bridge entry

## Verification After Fix
- Query ledger for `rent_repayment` entries with the test tenant's ID
- Confirm agent wallet balance increases after commission
- Confirm no duplicate entries exist for the same payment

## Technical Detail
The `create_ledger_transaction` RPC does NOT validate categories against a whitelist — it accepts any string. This means `tenant_repayment` silently succeeds but creates orphaned entries invisible to all reporting queries that filter on `rent_repayment`.

