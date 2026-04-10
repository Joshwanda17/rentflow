

# Fix: Pending Approval Queue Navigates to Wrong Tab

## Problem
The "Pending Approval Queue" on the CFO Overview counts **7 pending items from `pending_wallet_operations`** (wallet deposits, portfolio top-ups, etc.), but the "View All →" button navigates to the **Withdrawals tab**, which queries a completely different table (`withdrawal_requests`). That's why you only see 1 item there.

### Current Database State
The 7 pending items are:
- 2 portfolio top-ups (2.6M + 100K)
- 5 wallet deposits (40K, 19.5K, 19.2K, 21.2K, 21K)

**None of these are withdrawals.** They belong in the CFO's pending wallet operations approval queue.

## Fix — Two Changes

### 1. Route "View All →" to the Correct Tab
In `CFOOverviewDashboard.tsx`, change `onTabChange?.('withdrawals')` to `onTabChange?.('approvals')` (or whichever tab hosts the `PendingWalletOperationsWidget`).

### 2. Ensure FinOps Withdrawal Tab Also Shows `approved`/`manager_approved`
Currently `FinOpsWithdrawalVerification.tsx` only queries `status IN ['pending', 'requested']`. There are ~18 withdrawal requests stuck at `approved` or `manager_approved` that FinOps should see and finalize. Update the filter to include those statuses so FinOps can complete them.

**Files changed:**
- `src/components/cfo/CFOOverviewDashboard.tsx` — fix "View All" navigation target
- `src/components/financial-ops/FinOpsWithdrawalVerification.tsx` — expand status filter to include `approved`, `manager_approved`

### Technical Detail
```
pending_wallet_operations (7 pending) ← CFO approves these
withdrawal_requests (1 pending, 18 approved) ← FinOps finalizes these
```

The Pending Approval Queue should route to wherever the CFO reviews `pending_wallet_operations`, not to the withdrawal verification tab.

