

# Enhance Approve Dialog with Requester Details and TID Input

## Problem
When a Financial Operations manager taps **Approve** on a pending withdrawal, the current dialog only shows the amount and name with a simple confirm button. It does not display the requester's phone number, and it requires TID entry in a separate step later. The manager wants both the requester info and TID entry consolidated into the Approve dialog.

## Changes

### Edit: `src/components/financial-ops/FinOpsWithdrawalVerification.tsx`

**Update the Approve dialog (lines 382–400)** to:

1. Display the requester's **full name**, **phone number**, **mobile money details**, and **recipient name** prominently in the dialog body
2. Add a **Transaction ID (TID)** input field (font-mono, uppercase, minimum 3 characters)
3. Change the confirm button to "Approve & Complete" — disabled until TID is entered
4. Update `handleApprove` to also save the TID reference (set status directly to `fin_ops_approved` with the reference stored, or if TID is provided, complete the full flow)

The dialog will look like:
```text
┌──────────────────────────────┐
│ Approve Withdrawal           │
│                              │
│ Name: John Doe               │
│ Phone: 0771234567            │
│ MoMo: MTN · 0771234567      │
│ Recipient: John Doe          │
│ Amount: UGX 50,000           │
│ Reason: "Salary advance..."  │
│                              │
│ [Transaction ID input      ] │
│                              │
│     [Cancel]  [Approve]      │
└──────────────────────────────┘
```

5. The **Approve** button remains disabled until TID has at least 3 characters
6. On confirm, the status updates to `fin_ops_approved` with the TID stored in `fin_ops_reference`

### Files Changed
- **Edit**: `src/components/financial-ops/FinOpsWithdrawalVerification.tsx` — enhance approve dialog with requester details and TID input

