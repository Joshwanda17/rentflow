

# Fix: Remove Old/Approved Withdrawals from FinOps Queue

## Problem
The `FinOpsWithdrawalVerification` component queries withdrawal requests with statuses `pending`, `requested`, `approved`, and `manager_approved`. The `approved` and `manager_approved` statuses are bringing back old, already-processed withdrawals that should no longer appear in the queue. The screenshot confirms requests from "about 1 month ago" are showing up.

## Solution
Edit `src/components/financial-ops/FinOpsWithdrawalVerification.tsx`:

1. **Remove `approved` and `manager_approved` from the status filter** — only fetch `pending` and `requested` statuses, which are the only ones that genuinely need Financial Ops action.
2. **Add a 30-day cutoff** — filter out any request older than 30 days to prevent stale zombie requests from appearing, using `.gte('created_at', thirtyDaysAgo)`.
3. **Sort newest-first** (already in place).

This ensures only fresh, truly-pending withdrawal requests appear in the queue — no old approved or stale items.

