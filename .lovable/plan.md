
Goal: fix the COO approval bug where an item disappears immediately after approval but comes back after refresh.

What I found

1. The COO screen at `/coo/dashboard` is using:
   `COODashboardPage -> FinancialOpsCommandCenter -> PendingWalletOperationsWidget`
   So the bug is coming from `PendingWalletOperationsWidget`, not the bulk `ApprovalQueue`.

2. The COO widget removes the item from local state immediately after any successful edge-function response:
   - `src/components/manager/PendingWalletOperationsWidget.tsx`
   - `handleAction()` calls `setOperations(prev => prev.filter(op => op.id !== opId))`

3. The backend approval function can silently skip the actual approval:
   - `supabase/functions/approve-wallet-operation/index.ts`
   - if ledger creation fails, it does:
     `continue;`
   - then the function still returns HTTP 200 with `success: true`

4. That creates this exact failure path:

```text
COO clicks Approve
-> widget gets 200 response
-> widget removes card locally
-> backend had skipped status update because ledger step failed
-> row stays status='pending' in database
-> refresh reloads from DB
-> item appears again
```

5. There is also a secondary inconsistency in the shared bulk queue:
   - `ApprovalQueue` sends `ids` / `reason`
   - edge function expects `bulk_ids` / `rejection_reason`
   This is not the main COO route bug, but it should be corrected while fixing this flow.

Implementation plan

1. Fix backend truthfulness in `approve-wallet-operation`
   - Remove the silent `continue` behavior for approval failures.
   - If ledger creation fails for an operation, return that operation as failed instead of pretending success.
   - If zero operations were actually approved/rejected, return a non-2xx error.
   - Return explicit `results`, `approved_ids`, and `failed_ids` so the UI can trust the response.
   - Verify/fix the ledger call shape used by this function so approvals complete instead of being skipped.

2. Fix the COO widget to use backend results, not optimistic removal
   - In `PendingWalletOperationsWidget.tsx`, only remove the item if the response confirms that exact `opId` was approved/rejected.
   - If the response contains no successful result for that row, keep it visible and show the backend error.
   - After any action, re-fetch `get_pending_wallet_ops` instead of relying only on local state.

3. Harden the shared approval queue
   - Update `src/components/financial-ops/ApprovalQueue.tsx` to send the correct request fields (`bulk_ids`, `rejection_reason`).
   - Remove items from cache only for IDs actually returned as successful.
   - Invalidate queue queries on both success and partial failure.

4. Validate safely
   - Run background-only approval tests against test records, not real user rows.
   - Scenarios:
     - single COO approval succeeds and row stays gone after refresh
     - ledger failure returns visible error and row remains in queue
     - partial bulk approval removes only successful rows
     - reject flow still works
     - ROI payout approval path specifically works end-to-end

Technical details

Files to update:
- `supabase/functions/approve-wallet-operation/index.ts`
- `src/components/manager/PendingWalletOperationsWidget.tsx`
- `src/components/financial-ops/ApprovalQueue.tsx`

No database migration is required unless the ledger RPC itself needs a signature-alignment fix beyond this function call pattern.

Acceptance criteria

- COO clicks Approve
- item disappears
- page refresh does not bring it back
- if backend approval fails, the item stays visible and an error is shown
- bulk approval removes only truly approved rows
