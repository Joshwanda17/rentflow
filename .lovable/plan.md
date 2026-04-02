

# Wallet Withdrawal: Add Reason, Save All Payout Details, Show on FinOps

## Changes

### 1. Database Migration — Add `reason` column
Add `reason TEXT` to `withdrawal_requests` (nullable for backward compat, but UI will require it).

### 2. `src/components/wallet/WithdrawRequestDialog.tsx` — Require reason + save all fields
- Add `reason` state and a `<Textarea>` with placeholder *"Why are you withdrawing?"* (min 10 chars)
- Add reason to `isFormValid` check
- **Fix the insert** to include all collected payout fields that are currently missing:
  - `mobile_money_name`, `payout_method`, `bank_name`, `bank_account_name`, `bank_account_number`, `agent_location`, `reason`

### 3. `src/components/financial-ops/FinOpsWithdrawalVerification.tsx` — Show all details + ledger on TID
- Add `reason` to the `WithdrawalRequest` interface
- In `renderRequestCard`: display **recipient name** (`mobile_money_name` or `bank_account_name`) prominently, and show the `reason` in a visible info block
- In `handleTidComplete`: after status update, insert a `cash_out` ledger entry with the TID reference — this records the transaction but does NOT double-deduct (balance was already deducted on request creation by the `trg_deduct_wallet_on_withdrawal_request` trigger)
- Stay on the same page after completion (already the case)

## Files Modified
- DB migration: `ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS reason TEXT`
- `src/components/wallet/WithdrawRequestDialog.tsx`
- `src/components/financial-ops/FinOpsWithdrawalVerification.tsx`

