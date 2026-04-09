

# Remove Bank Reference from COO Wallet Ops Approval Dialog

## Problem
The "Confirm Approval" dialog in the COO's "Wallets & Ops" tab (rendered by `PendingWalletOperationsWidget` inside `FinancialOpsCommandCenter`) requires both a Payment Method selection and a Bank Reference Number / TID input. The COO should not need to provide payment references — that is Financial Ops' job.

## What we'll change

### File: `src/components/manager/PendingWalletOperationsWidget.tsx`

This widget is shared across dashboards, so instead of modifying it globally (which would break Financial Ops), we need a different approach. However, since the user said "leave the rest intact" and only remove the reference field, and the screenshot clearly shows this is the same shared component, the simplest fix is:

**Option chosen**: Add an optional `skipPaymentRef` prop to `PendingWalletOperationsWidget`, then pass it from the COO's usage via `FinancialOpsCommandCenter`.

Actually, the cleaner approach given "just remove it on COO" is to make the component context-aware. But that's complex. Let me check if there's a simpler path.

**Simpler approach**: Since the COO dashboard renders `FinancialOpsCommandCenter` directly, and modifying a shared component risks breaking Financial Ops, the best approach is:

1. **Add a `requirePaymentRef` prop** (default `true`) to `PendingWalletOperationsWidget`
2. When `false`: skip the reference input, allow approval with just the payment method selected
3. **Thread the prop** through `FinancialOpsCommandCenter` 
4. **Pass `requirePaymentRef={false}`** from the COO Dashboard

### Files changed
1. `src/components/manager/PendingWalletOperationsWidget.tsx` — add `requirePaymentRef` prop, conditionally hide reference input, adjust validation
2. `src/components/financial-ops/FinancialOpsCommandCenter.tsx` — accept and forward `requirePaymentRef` prop
3. `src/pages/coo/Dashboard.tsx` — pass `requirePaymentRef={false}` to `FinancialOpsCommandCenter`

### Details

**PendingWalletOperationsWidget.tsx**:
- Add `requirePaymentRef?: boolean` prop (default `true`)
- Change `canConfirmApproval` to only require payment method when `requirePaymentRef` is false
- Conditionally render the reference input block (lines 431-444) only when `requirePaymentRef` is true
- When approving without ref, pass empty string for `payment_reference`

**FinancialOpsCommandCenter.tsx**:
- Accept `requirePaymentRef?: boolean` and forward to `PendingWalletOperationsWidget`

**COO Dashboard.tsx**:
- `<FinancialOpsCommandCenter requirePaymentRef={false} />`

