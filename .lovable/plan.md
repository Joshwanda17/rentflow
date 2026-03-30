

# Require Transaction ID on All Deposit and Withdrawal Approvals

## Current State

| Approval Flow | File | TID Required? |
|---|---|---|
| COO Withdrawal Approval | `COOWithdrawalApprovals.tsx` | Yes (+ time) |
| Agent Commission Payouts | `AgentCommissionPayoutsManager.tsx` | Yes |
| CFO Withdrawal Approval | `CFOWithdrawalApprovals.tsx` | **No** |
| Manager Withdrawal Approval | `WithdrawalRequestsManager.tsx` | **No** |
| Deposit Approval (Financial Ops) | `DepositsManagement.tsx` | **No** (direct button click) |
| Deposit Approval (Manager) | `DepositRequestsManager.tsx` | **No** |
| Deposit Approval (Agent) | `PendingDepositsSection.tsx` | **No** |

## Changes

### 1. Deposit Approvals -- Add TID confirmation dialog (3 files)

Currently deposits are approved with a single button click. Replace the direct `handleApprove(deposit)` call with a confirmation dialog that requires a Transaction ID input before proceeding.

**Files:**
- `src/pages/DepositsManagement.tsx` -- Add state for `approveDialog` (selected deposit + TID input). Replace direct approve button with dialog opener. Add AlertDialog with TID Input field. Pass `transaction_id` to the `approve-deposit` edge function body.
- `src/components/manager/DepositRequestsManager.tsx` -- Same pattern.
- `src/components/agent/PendingDepositsSection.tsx` -- Same pattern.

### 2. Manager Withdrawal Approval -- Require TID before forwarding to CFO

**File:** `src/components/manager/WithdrawalRequestsManager.tsx`

The approve dialog already exists but does not enforce a TID. Add:
- A `transactionId` input field inside the existing `AlertDialogContent`
- Validation: disable the Approve button when `transactionId` is empty
- Save `transaction_id` alongside the `manager_approved` status update

### 3. CFO Withdrawal Approval -- Require TID before forwarding to COO

**File:** `src/components/cfo/CFOWithdrawalApprovals.tsx`

The approve dialog is a simple confirm. Add:
- `transactionId` state (already declared but unused -- wire it in)
- An Input field for TID in the approve dialog
- Validation: disable approve when TID is empty
- Save `transaction_id` (or `cfo_transaction_id`) alongside the `cfo_approved` status update

### UI Pattern (consistent across all)

```
AlertDialog:
  Title: "Confirm Approval"
  Description: "Enter the Transaction ID to approve [amount]"
  Input: Transaction ID (required, trimmed, uppercased)
  Buttons: [Cancel] [Approve] (disabled until TID entered)
```

## No database changes needed
The `deposit_requests` and `withdrawal_requests` tables already have `transaction_id` columns. The edge function `approve-deposit` already accepts a `transaction_id` in its body.

