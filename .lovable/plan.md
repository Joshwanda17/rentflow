# Remove Bank Reference / TID from COO Withdrawal Dialog

## Problem

The COO dashboard's "Wallets & Ops" tab renders the full `FinancialOpsCommandCenter` component, which includes the `PendingWalletOperationsWidget`. That widget has a "Confirm Approval" dialog requiring Payment Method and Bank Reference Number — these are Financial Ops responsibilities, not the COO's.

## Root Cause

In `src/pages/coo/Dashboard.tsx` (line 109-114), the `wallets` tab directly renders `<FinancialOpsCommandCenter />`, giving the COO full Financial Ops capabilities including payment reference entry.

## Solution

Remove the `FinancialOpsCommandCenter` from the COO dashboard's "Wallets & Ops" tab. The COO already has a dedicated "Withdrawals" tab (line 148-155) with `COOWithdrawalApprovals` and `COOPartnerWithdrawalApprovals` — which we already cleaned up to not require payment references.

### File: `src/pages/coo/Dashboard.tsx`

1. **DO NOT Remove the** `wallets` **tab** entirely — it gives the COO access to Financial Ops tools (deposit verification, wallet deductions, reconciliation) that belong to the Financial Ops role, not the COO.
2. **Remove the `FinancialOpsCommandCenter` import** (line 14).
3. **Remove the "Wallets & Ops" entry** from `quickNavItems` (line 37).

This ensures the COO only sees operational clearance dialogs (already cleaned up) and never encounters payment method/bank reference fields.

### Files changed

1. `src/pages/coo/Dashboard.tsx` — remove wallets tab and FinancialOpsCommandCenter