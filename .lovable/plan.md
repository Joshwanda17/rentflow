

## Fix: Remove Deposit Approval from Approval Queue

### Problem
The Financial Ops Approval Queue has a "Deposits" tab that duplicates the dedicated "Verify Deposits" (TID Verification) flow. Having two ways to approve deposits creates a risk of double-crediting wallets.

### Solution
Remove the "Deposits" tab entirely from the Approval Queue component. The only way to approve deposits should be through the dedicated "Verify Deposits" flow (TidVerification component).

### Changes

**`src/components/financial-ops/ApprovalQueue.tsx`**
- Remove `'deposits'` from the `QueueType` type
- Change default `activeQueue` state from `'deposits'` to `'wallet_withdrawals'`
- Remove the "Deposits" tab trigger from the TabsList
- Remove all deposit-specific verification dialog state and handlers
- Remove deposit fetching logic from the data query
- Remove deposit-specific approval/rejection logic (the `handleDepositAction` function and related state)

**`src/components/financial-ops/FinancialOpsCommandCenter.tsx`**
- No changes needed — the Approval Queue is already behind the "More Tools" sheet; removing the deposits tab inside it is sufficient

### Result
- Deposits can only be approved via the dedicated "Verify Deposits" → TID Verification flow
- The Approval Queue will only show "Cash Out" and "Wallet Ops" tabs
- Eliminates the double-credit risk entirely

