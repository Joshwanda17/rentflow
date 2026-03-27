

## Revised Plan: Add Portfolio Creation to Partner Ops WITHOUT Removing It from Agent Flow

### Problem
The previous (cancelled) implementation already stripped portfolio creation from `CreateUserInviteDialog.tsx`. The agent invite now says "Portfolio will be created by Partner Ops" and no longer calls the `create-investor-portfolio` edge function. **This needs to be undone.**

### What Changes

**1. Restore portfolio creation in agent invite flow**
- `src/components/agent/CreateUserInviteDialog.tsx`: Restore the `create-investor-portfolio` edge function call after the invite is created. Re-add investment form fields (amount, duration, ROI, PIN, payment method) to the supporter form. Remove the "Portfolio will be created by Partner Ops" messages and restore the portfolio details in the success screen.

**2. Enhance `CreateInvestmentAccountDialog` for Partner Ops use**
- `src/components/manager/CreateInvestmentAccountDialog.tsx`: 
  - Add missing fields: payment method (mobile money / bank), payout day, portfolio PIN
  - Switch from direct DB insert to calling the `create-investor-portfolio` edge function (handles validation, code generation, pending_wallet_operations, audit trail)
  - Remove manual portfolio_code input (edge function auto-generates it)

**3. Add "Create Portfolio" buttons to Partner Ops dashboards**
- `src/components/executive/PartnersOpsDashboard.tsx`: Add a prominent "Create Portfolio" button on overview/portfolios views (the dialog import and state already exist)
- `src/components/coo/COOPartnersPage.tsx`: Add a top-level "Create Portfolio" button on the portfolios list view

**4. Edge function role check (already done)**
- The `create-investor-portfolio` edge function was already updated to accept `manager`, `coo`, `super_admin`, `operations` roles — this stays.

### Files to Modify
- `src/components/agent/CreateUserInviteDialog.tsx` — Restore portfolio creation logic and investment fields
- `src/components/manager/CreateInvestmentAccountDialog.tsx` — Add payment/PIN fields, use edge function
- `src/components/executive/PartnersOpsDashboard.tsx` — Add visible "Create Portfolio" button
- `src/components/coo/COOPartnersPage.tsx` — Add top-level create button

