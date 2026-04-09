

# Remove Payment Reference Requirement from COO Withdrawal Approval

## Problem
The COO withdrawal approval dialog (`COOWithdrawalApprovals.tsx`) currently requires a **Transaction ID** and **Transaction Time** before the COO can approve. This is wrong — the COO's role is operational clearance (business review), not payment execution. Payment references (TID, bank ref) are the responsibility of **Financial Ops** who actually disburse the funds.

## What we'll change

### File: `src/components/coo/COOWithdrawalApprovals.tsx`

1. **Remove state variables** for `transactionId` and `transactionTime` (lines 45-46)
2. **Remove Input import** (line 6) and **Label import** (line 8) — no longer needed
3. **Simplify `handleApprove`** (lines 88-124):
   - Remove the validation checks for transactionId and transactionTime (lines 90-97)
   - Remove `transaction_id` and `transaction_time` from the update payload (lines 109-110)
   - Keep `status: 'approved'`, `coo_approved_at`, `coo_approved_by`, `processed_by`, `processed_at`
4. **Simplify the approve dialog** (lines 250-293):
   - Remove the Transaction ID input and Transaction Time input fields entirely
   - Change dialog title from "Final Approval & Payment" to "Confirm Operations Clearance"
   - Update description to clarify this is an operational sign-off, not a payment confirmation
   - Remove the disabled condition checking for transactionId/transactionTime
   - Change button text from "Approve & Confirm Payment" to "Approve & Forward"
5. **Update the card button** text from "Approve & Pay" to "Approve" (line 239)

The COO approval simply moves the withdrawal to `approved` status, after which Financial Ops handles the actual disbursement and records payment references.

## Files changed
1. `src/components/coo/COOWithdrawalApprovals.tsx` — remove payment reference fields from approval dialog

