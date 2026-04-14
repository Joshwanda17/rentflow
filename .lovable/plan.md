

## Plan: Enhance Investment Accounts Drawer

### Changes

**1. Expand `PortfolioRecord` interface & query** (`src/hooks/useCapitalOpportunities.ts`)
- Add fields to the interface: `portfolio_code`, `account_name`, `maturity_date`, `duration_months`, `auto_reinvest`, `roi_mode`, `next_roi_date`, `created_at`, `display_currency`
- Update the `.select()` calls to fetch these additional columns

**2. Make drawer content scrollable** (`src/components/supporter/InvestmentAccountsDrawer.tsx`)
- Wrap the tab content area in a `ScrollArea` (or use `overflow-y-auto` with a calculated height) so the list scrolls within the 85vh sheet

**3. Redesign Support Accounts tab — portfolio list rows**
- Show: Portfolio Name (`account_name` or fallback to `portfolio_code`), Portfolio ID (`portfolio_code`), Principal amount, ROI %, and status badge
- Status badges for: `active`, `pending`, `pending_approval`, `matured`, `withdrawn`, etc.

**4. Redesign Portfolio Detail sheet** (the dialog that opens on row tap)
- **Header**: Portfolio name + code + status badge
- **Overview section**: Total Value, Principal, Total ROI Earned, Monthly Return, ROI Rate, Maturity Date, Duration, ROI Mode, Next ROI Date
- **Action buttons** (visible based on status):
  - **Top Up** — dispatches `open-deposit` event (existing)
  - **Compound** — new button dispatching `open-compound` event (or toggling `auto_reinvest`)
  - **Withdraw** — dispatches `open-withdrawal` event with portfolio context
- **Info hint** at bottom about how returns work

### Files Modified
- `src/hooks/useCapitalOpportunities.ts` — expand interface + query
- `src/components/supporter/InvestmentAccountsDrawer.tsx` — scrollable content, richer list rows, enhanced detail sheet with compound/withdraw actions

