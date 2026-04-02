
Goal: make processed withdrawals stay gone after refresh.

What is actually broken:
- The UI is removing rows optimistically before confirming the database update truly persisted.
- `withdrawal_requests` currently has an UPDATE path that is inconsistent with the staff workflow: Financial Ops/CFO screens update rows directly from the client, but the table policies are still effectively centered on manager updates. That can produce “looked successful in UI, came back after refresh” behavior.
- The reject function is also too forgiving: it returns success even when individual rows fail, and the frontend does not inspect per-row results.
- There is a separate workflow bug in `src/components/manager/WithdrawalRequestsManager.tsx`: approve writes `status: 'pending'`, so the same item is fetched again on refresh.

Implementation plan

1. Fix persistence rules for staff actions
- Add a database migration to update `withdrawal_requests` policies so authorized staff roles (`manager`, `operations`, `cfo`, `coo`, `super_admin`) can update rows in the approval pipeline.
- Keep user-facing access restricted to each user’s own withdrawals.

2. Fix status transitions so rows move forward instead of reappearing
- `src/components/financial-ops/FinOpsWithdrawalVerification.tsx`
  - approve should persist `fin_ops_approved`
  - complete should persist `approved`
- `src/components/cfo/CFOWithdrawalApprovals.tsx`
  - approve should persist `cfo_approved`
- `src/components/manager/WithdrawalRequestsManager.tsx`
  - stop writing `pending` on approve
  - write the real next-stage status so the row leaves that pending query permanently

3. Make rejection trustworthy
- `supabase/functions/reject-withdrawal/index.ts`
  - return a real failure when updates do not happen, or at minimum expose failed row results clearly
- `src/components/financial-ops/FinOpsWithdrawalVerification.tsx`
- `src/components/financial-ops/ApprovalQueue.tsx`
  - inspect the returned `results`
  - only remove rows that were actually rejected
  - show a specific error if a row was not updated

4. Stop false-success optimistic removals
- In all affected withdrawal screens, only remove a row from local state after confirmed persistence.
- If an update affects zero rows, keep the item visible and show an actionable error instead of a success toast.

5. Audit each queue’s fetch filter
- Ensure each screen only reloads the statuses it truly owns:
  - Fin Ops pending queue: initial withdrawal stage only
  - CFO queue: `fin_ops_approved`
  - final completion queue: `cfo_approved`
  - manager legacy queue: only its real stage
- This prevents processed records from being pulled back into the wrong list after refresh.

Files to update
- `src/components/financial-ops/FinOpsWithdrawalVerification.tsx`
- `src/components/financial-ops/ApprovalQueue.tsx`
- `src/components/cfo/CFOWithdrawalApprovals.tsx`
- `src/components/manager/WithdrawalRequestsManager.tsx`
- `supabase/functions/reject-withdrawal/index.ts`
- one migration for `withdrawal_requests` policies

Expected result
- Approved/rejected withdrawals remain gone after refresh.
- Each item moves to the correct next queue/history state.
- Staff no longer see fake success when the database row was not actually updated.
