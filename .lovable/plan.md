

# Simplify Wallet Withdrawals to Single-Step Financial Ops Approval

## Overview

Replace the current 4-stage withdrawal pipeline (pending → fin_ops_approved → cfo_approved → approved) with a single approval step: Financial Ops reviews the request, enters TID/receipt/bank reference, and completes it directly (pending → approved).

## Changes

### 1. `src/components/financial-ops/FinOpsWithdrawalVerification.tsx`

- **Remove Section B** (the "Awaiting TID Completion" card that fetches `cfo_approved` requests and the `tidOpen`/`handleTidComplete` flow)
- **Change `handleApprove`**: Instead of setting status to `fin_ops_approved`, set it directly to `approved` with the TID/reference. Record an audit log with action `fin_ops_complete_withdrawal`
- Remove `tidRequests` state, the `tidRes` fetch, and the TID completion dialog
- Keep the approve dialog as-is (it already collects payment method + TID/receipt/bank reference)
- Update the "Approve & Forward" button label to "Approve & Complete"
- Toast message changes from "forwarded to CFO" to "Withdrawal completed"

### 2. `src/components/cfo/CFOWithdrawalApprovals.tsx`

- **Remove entirely** or convert to a read-only historical view. Since there's no longer a `fin_ops_approved` status for the CFO to act on, this component serves no purpose
- Remove its import/usage from `src/pages/cfo/Dashboard.tsx` and `src/pages/CFODashboard.tsx`

### 3. `src/components/wallet/WithdrawalStepTracker.tsx`

- Simplify the wallet steps from 4 stages to 2:
  1. "Requested" — withdrawal submitted
  2. "Approved & Paid" — Financial Ops approved with TID
- Update `getActiveStepIndex` for wallet variant accordingly

### 4. `src/components/wallet/UserWithdrawalRequests.tsx`

- Remove references to `fin_ops_approved` and `cfo_approved` statuses in the status config and pending count filter
- Simplify to just `pending` and `approved`/`rejected`

### 5. `src/components/coo/COOWithdrawalApprovals.tsx`

- Remove the `cfo_approved` status fetch for wallet withdrawals (this component fetches `cfo_approved` requests). If it only handles wallet withdrawals, remove it; if it handles other types too, just remove the wallet withdrawal part

### Files Modified

- `src/components/financial-ops/FinOpsWithdrawalVerification.tsx` — single-step approve with TID
- `src/components/cfo/CFOWithdrawalApprovals.tsx` — remove
- `src/pages/cfo/Dashboard.tsx` — remove CFOWithdrawalApprovals import
- `src/pages/CFODashboard.tsx` — remove CFOWithdrawalApprovals import
- `src/components/wallet/WithdrawalStepTracker.tsx` — simplify to 2 steps
- `src/components/wallet/UserWithdrawalRequests.tsx` — remove intermediate statuses

