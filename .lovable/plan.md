

## Problem

The "Return" stat in the Funder Dashboard card shows **mock data** (`rentSecured * 0.15`), not the actual earned ROI from the database. The Investment Breakdown sheet already fetches real data but the summary card ignores it.

## Plan

### 1. Fetch actual ROI earned in SupporterDashboard

In `src/components/dashboards/SupporterDashboard.tsx`, add a query to `investor_portfolios` to sum `total_roi_earned` for the user. Store it in a new state variable `totalRoiEarned`.

Add to the existing `fetchTotalContributed` function:
- Query `investor_portfolios` for `total_roi_earned` (already partially queried, just need to also select `total_roi_earned`)
- Sum the values and store in state

### 2. Update PortfolioSummaryCards props

In `src/components/supporter/PortfolioSummaryCards.tsx`:
- Add `totalReturn: number` to props interface
- Remove the hardcoded `const totalReturn = rentSecured * 0.15`
- Use the prop value directly for the "Return" display

### 3. Pass real data from SupporterDashboard to PortfolioSummaryCards

Pass the fetched `totalRoiEarned` as the `totalReturn` prop.

### 4. Ensure InvestmentBreakdownSheet shows accurate dates

The sheet already shows invested date and maturity date. Minor improvements:
- Make the "Invested on" date more prominent with actual date formatting
- Ensure the "Supported date" label is clear
- Keep lightweight -- no new heavy components

### Files Changed

| File | Change |
|------|--------|
| `src/components/dashboards/SupporterDashboard.tsx` | Fetch `total_roi_earned` from `investor_portfolios`, pass as prop |
| `src/components/supporter/PortfolioSummaryCards.tsx` | Accept `totalReturn` prop, remove mock calculation |

### Technical Notes

- Single additional column in existing query (no new DB call)
- No new dependencies or heavy components
- CSS-only, no animation libraries

