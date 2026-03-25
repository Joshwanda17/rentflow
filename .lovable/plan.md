

## Plan: Move Wallet Approvals from Partner Ops to Financial Ops

### What Changes

The `PendingWalletOperationsWidget` is currently rendered in the **Partner Operations Dashboard** (`PartnersOpsDashboard.tsx`). It will be removed from there and added to the **Financial Ops Command Center** (`FinancialOpsCommandCenter.tsx`) under the "Ops Center" tab.

### Files to Change

| File | Action |
|------|--------|
| `src/components/executive/PartnersOpsDashboard.tsx` | Remove `PendingWalletOperationsWidget` import and usage (line 331) |
| `src/components/financial-ops/FinancialOpsCommandCenter.tsx` | Add `PendingWalletOperationsWidget` to the Ops Center tab content |

### Technical Details

1. **PartnersOpsDashboard.tsx**: Remove the import of `PendingWalletOperationsWidget` and delete the `<PendingWalletOperationsWidget />` line (~line 331).

2. **FinancialOpsCommandCenter.tsx**: Import `PendingWalletOperationsWidget` from `@/components/manager/PendingWalletOperationsWidget` and render it inside the "ops" tab content, placed prominently near the top (after the existing approval/ops components).

