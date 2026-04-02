

# Fix: Stay on Current View After Rejecting Withdrawal Requests

## Problem
After rejecting a withdrawal request, the user is navigated away from the current withdrawal queue view instead of remaining on the same screen. This affects withdrawal rejection across multiple dashboard components.

## Root Cause Investigation
All withdrawal rejection handlers follow the same pattern:
1. Update status to 'rejected'
2. Show success toast
3. Close dialog
4. Call `fetchRequests()` to refresh the list

The components themselves don't navigate away. The likely cause is that the parent dashboard re-renders after the rejection (due to state propagation or query invalidation), which resets the active sub-view back to the overview/home state.

## Affected Components
1. `src/components/financial-ops/FinOpsWithdrawalVerification.tsx` — FinOps pending withdrawals
2. `src/components/cfo/CFOWithdrawalApprovals.tsx` — CFO approval queue
3. `src/components/coo/COOWithdrawalApprovals.tsx` — COO approval queue
4. `src/components/executive/PartnerOpsWithdrawalQueue.tsx` — Partner Ops withdrawal queue
5. `src/components/manager/WithdrawalRequestsManager.tsx` — Manager dashboard withdrawals
6. `src/components/financial-ops/ApprovalQueue.tsx` — FinOps bulk approval queue

## Fix Strategy
For each component, ensure the rejection handler:
1. Removes the rejected item from local state **immediately** (optimistic update) instead of re-fetching the entire list — this prevents parent re-renders
2. Uses `fetchRequests()` as a background refresh that doesn't disrupt the view
3. Preserves scroll position after the list update

### Implementation per component:
- After successful rejection, filter out the rejected item from the local `requests` state array directly: `setRequests(prev => prev.filter(r => r.id !== selected.id))`
- Then call `fetchRequests()` in the background (without setting loading state) to ensure data consistency
- Same pattern for approve handlers to maintain consistency

### Files Modified
- `src/components/financial-ops/FinOpsWithdrawalVerification.tsx`
- `src/components/cfo/CFOWithdrawalApprovals.tsx`
- `src/components/coo/COOWithdrawalApprovals.tsx`
- `src/components/executive/PartnerOpsWithdrawalQueue.tsx`
- `src/components/manager/WithdrawalRequestsManager.tsx`
- `src/components/financial-ops/ApprovalQueue.tsx`

Each rejection handler will be updated to do optimistic local state removal first, then a silent background refresh.

