# Fix: Advance Repayment Priority on Wallet Deposit

## Problem

The current deposit processing in `approve-wallet-operation` handles rent repayment first (lines 185-257), then advance repayment (lines 259-355). By the time advances are processed, the wallet balance is often depleted, so advances keep compounding without recovery.

## Solution

Swap the execution order of the two auto-deduction blocks so advances are repaid before rent. BUT IT SHOULDN'T SETTLE THE MISSED DAYS. IT SHOULD CUT A CERTAIN PROPORTION OF THE MONEY TO PAY THE ADVANCE

## Changes

### File: `supabase/functions/approve-wallet-operation/index.ts`

1. **Move the advance repayment block (lines 259-355) above the rent repayment block (lines 185-257)**
2. Update the advance block's condition: remove the `rent_payment_for_tenant` exclusion check (not needed since it already excludes `supporter_facilitation_capital`)
3. Update the rent repayment block's condition to remain unchanged (it already re-reads the wallet balance)
4. Update comments to reflect the new priority order:
  - Priority 1: Advance repayment
  - Priority 2: Rent repayment
  - Priority 3: Remainder stays in wallet

No database migration needed. No other files modified. The existing advance repayment logic (idempotency, ledger entries, audit trail, notifications) is already correct — only the execution order changes.