

## Plan: Move Portfolio Creation to Partner Ops Dashboard (Remove from Agent Flow)

### Current State
- **Agents** can create portfolios during the supporter invite flow (`CreateUserInviteDialog` calls `create-investor-portfolio` edge function).
- **Partner Ops Dashboard** (`PartnersOpsDashboard`) already has `CreateInvestmentAccountDialog` for creating portfolios, and `COOPartnersPage` has a full "Add Portfolio" dialog within partner detail views.
- The agent flow tightly couples invite creation with portfolio creation, which leads to issues like Benjamin's case — cancelled invite = no portfolio, with no way for ops to fix it.

### What Changes

**1. Remove portfolio creation from the agent invite flow**
- In `src/components/agent/CreateUserInviteDialog.tsx`: Remove the `create-investor-portfolio` edge function call (lines ~219-246). Agents will only create the supporter invite — portfolio creation becomes an ops-only responsibility.
- Update the success screen to remove portfolio-related fields (portfolio code, activation token, investment details) since agents won't be creating portfolios anymore.
- Remove the supporter investment form fields (amount, duration, ROI, PIN, payment method) from the agent invite dialog since those are now handled by Partner Ops.

**2. Enhance the Partner Ops "Create Portfolio" flow**
- In `COOPartnersPage.tsx`: Ensure the "Add Portfolio" button is prominently accessible (it already exists in the partner detail view). Add a top-level "Create Portfolio" button on the portfolios list view so ops can create portfolios without first navigating into a partner's detail.
- In `PartnersOpsDashboard.tsx`: Add a visible "Create Portfolio" button on the overview and portfolios views that opens `CreateInvestmentAccountDialog`.

**3. Update `CreateInvestmentAccountDialog` to include missing fields**
- Add payment method fields (mobile money / bank), payout day, and portfolio PIN — fields currently only in the agent flow.
- Call the `create-investor-portfolio` edge function (which handles pending_wallet_operations and proper approval flow) instead of direct DB insert, ensuring the approval gate and ledger queuing are preserved.

### Files to Modify
- `src/components/agent/CreateUserInviteDialog.tsx` — Strip supporter portfolio creation logic and related form fields
- `src/components/manager/CreateInvestmentAccountDialog.tsx` — Add payment method, payout day, PIN fields; use edge function instead of direct insert
- `src/components/executive/PartnersOpsDashboard.tsx` — Add prominent "Create Portfolio" button on overview
- `src/components/coo/COOPartnersPage.tsx` — Add top-level create button (minor)

### Technical Details
- The `create-investor-portfolio` edge function already handles: validation, portfolio code generation via DB function, pending_wallet_operations queuing, and audit trail. The enhanced `CreateInvestmentAccountDialog` will call this function instead of doing a raw insert.
- Agent role verification in the edge function will be relaxed to also accept `manager`, `coo`, `super_admin`, `operations` roles (it currently accepts `agent` and `manager`).
- The supporter invite flow will remain intact for onboarding — it just won't create portfolios. Ops will create portfolios after the supporter is registered and verified.

