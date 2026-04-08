

# Add Reject Button to TID Deposit Verification

## Problem
The TID Verification screen only has "Auto-Approve" buttons for matched deposits. There is no way to reject a deposit from this screen. Withdrawals already have reject functionality.

## What Changes

### File: `src/components/financial-ops/TidVerification.tsx`

1. **Add reject state variables**: `rejectingId`, `rejectionReason`, `rejectDialogOpen`

2. **Add `handleReject` function**: Calls the existing `approve-deposit` edge function with `action: 'reject'` and `rejection_reason`. The backend already supports this — no edge function changes needed.

3. **Add Reject button next to Auto-Approve**: For each matched deposit, show both an Approve and a Reject button side by side. For mismatched amounts, show only the Reject button (since approve isn't offered for mismatches anyway).

4. **Add Reject confirmation dialog**: An `AlertDialog` with a textarea for the rejection reason (min 10 characters), matching the same pattern used in `FinOpsWithdrawalVerification.tsx`.

5. **Track rejected IDs**: Add a `rejectedIds` set (similar to `approvedIds`) so rejected items show a "Rejected" badge and disable further actions.

### No other files change
- The `approve-deposit` edge function already handles `action: 'reject'` with `rejection_reason`
- The `FinOpsWithdrawalVerification.tsx` already has reject — no changes needed there

## Result
- Every matched/mismatched deposit in TID Verification gets a red "Reject" button
- Clicking it opens a dialog requiring a reason (min 10 chars)
- Rejection calls the same backend, updates status, notifies the user, and logs an audit entry

