

# Fix: 241 Stale "Approved" Withdrawal Requests Flooding FinOps Queue

## The Problem

There are **241 withdrawal requests** stuck at `approved` status, dating from January 20 to late February. These were operationally approved months ago but never finalized in the system. Our recent filter expansion (adding `approved`/`manager_approved` to the FinOps view) surfaced all of them, flooding the queue with 100 items (the query limit).

## Root Cause

The old approval workflow had no FinOps finalization step — managers clicked "Approve" and the money was (presumably) paid out externally, but the status was never advanced to `completed`. These are **zombie records**, not active requests.

## Proposed Fix — Two Parts

### 1. Bulk-close the 241 stale approved requests (Data cleanup)

These requests are 2-3 months old. They need to be moved to either `completed` or `rejected` so they stop polluting the active queue.

**Option A (Recommended)**: Mark all 241 as `expired` or `rejected` with a system note explaining they were stale approvals from the pre-FinOps era. No ledger impact since the wallet deductions (if any) already happened or never happened.

**Option B**: Mark them as `completed` with a note "Legacy closure — pre-FinOps era". This assumes the money was actually paid out.

→ **Which option do you prefer?** Or should FinOps review each one individually?

### 2. Add a date filter / age indicator to the FinOps withdrawal view

To prevent this from happening again:
- Add a visual age badge (e.g., "3 months old") on stale requests
- Sort newest-first by default (currently ascending = oldest first)
- Optionally add a date range filter so FinOps can focus on recent items

### Files Changed
- **Database**: UPDATE query to close the 241 stale records (via insert tool)
- `src/components/financial-ops/FinOpsWithdrawalVerification.tsx` — change sort order to descending, add age indicator

