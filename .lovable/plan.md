# Fix: Advance Repayment on Wallet Deposit (Real-Time Recovery)

## Problem

The daily cron at 7:00 AM EAT always finds an empty wallet because deposits are consumed by other operations (tenant rent, commissions) within minutes. The advance balance compounds daily with zero recovery.

## Solution

Add real-time advance repayment logic to the `approve-wallet-operation` Edge Function, which already handles automatic rent repayment on deposit. When a deposit lands, after rent repayment, check for active/overdue advances and deduct from remaining balance.

## Changes

### 1. Update `approve-wallet-operation` Edge Function

**File: `supabase/functions/approve-wallet-operation/index.ts**`

After the existing automatic rent repayment block, add advance repayment logic:

- Query `agent_advances` for the depositing user where status is `active` or `overdue`
- If advances exist and wallet has remaining balance post-rent-repayment:
  - Calculate deduction amount (min of wallet remainder and outstanding balance)
  - Insert `cash_out` ledger entry with `category: 'advance_repayment'`, `transaction_group_id`, and `source_table: 'agent_advances'`
  - Update `agent_advances.outstanding_balance` (subtract deducted amount)
  - If fully repaid, set status to `completed`
  - Record in `agent_advance_ledger` for audit trail

### 2. Keep the Daily Cron (Catch-Up)

The existing `process-agent-advance-deductions` cron remains as a safety net for:

- Interest accrual (daily compounding must still happen)
- Catch-up deductions if real-time was missed
- No code changes needed — it already works correctly

### Technical Details

- Follows Single-Writer principle: all deductions go through `general_ledger` with `transaction_group_id`
- Idempotency: use the deposit's ledger `source_id` as part of the advance repayment `transaction_group_id` to prevent double-deduction
- Priority order on deposit: (1) Rent repayment first, (2) Advance repayment second, (3) Remainder stays in wallet
- The `sync_wallet_from_ledger` trigger handles actual wallet balance update

### Files Modified

- `supabase/functions/approve-wallet-operation/index.ts` — add advance repayment block after rent repayment