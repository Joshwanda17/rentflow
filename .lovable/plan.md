

## Cash Flow & Balance Sheet Verification — Issues Found

### Data Used (30-day window, platform scope)

| Category | Direction | Amount |
|---|---|---|
| tenant_access_fee | cash_out | 90,668 |
| rent_repayment | cash_in | 1,540,226 |
| rent_repayment | cash_out | 333,333 |
| pool_rent_deployment | cash_out | 3,060,000 |
| supporter_platform_rewards | cash_in | 67,500 |
| supporter_platform_rewards | cash_out | 67,500 |
| agent_commission_payout | cash_in | 8,187 |

Bridge scope: supporter_facilitation_capital cash_in = 61,066,541

---

### Issue 1: Cash Flow — pool_rent_deployment (3M) is invisible

`pool_rent_deployment` (USh 3,060,000 outflow) is in platform scope but is NOT listed in any Cash Flow category group — operating, custodial, or financing. It simply vanishes. This massively overstates the platform's cash position.

**Fix**: Add a dedicated "Rent Facilitation" section to Cash Flow, or include `pool_rent_deployment` and `rent_repayment` together as a "Facilitation Activities" group, keeping them separate from operating income.

### Issue 2: Cash Flow — rent_repayment inflates operating activities

`rent_repayment` (USh 1,540,226) is included in operating activities as if it were operating income. Rent repayments are capital pass-through flows (tenant → supporter), not platform revenue. This inflates net operating cash by ~1.5M.

**Fix**: Move `rent_repayment` out of operating activities into the new "Facilitation Activities" section alongside `pool_rent_deployment`.

### Issue 3: Cash Flow — closing balance mixes platform ops with supporter capital

Line 281: `netCashMovement = netOperating + netFinancing`. The financing section includes bridge-scope supporter capital (61M). Adding this to platform operating cash produces a meaningless closing balance (~63M) that doesn't represent any real account.

**Fix**: Separate the closing balance into "Platform Operating Cash" (from operating only) and show financing/facilitation as separate informational sections that don't roll into the platform cash position.

### Issue 4: Balance Sheet — `sumWithDirectionFallback` is all-or-nothing

The fallback function checks if the total across ALL categories in the preferred direction is > 0. If yes, it uses preferred for everything — even categories that only have data in the other direction.

Example with all-time data:
- Costs preferred direction (cash_out): supporter_platform_rewards = 67,500
- Since 67,500 > 0, the function returns 67,500 for ALL cost categories
- But agent_commission_payout only has cash_in entries (19,775) — these are silently dropped
- Result: platformCash is overstated by 19,775

**Fix**: Change `sumWithDirectionFallback` to work per-category instead of all-or-nothing across the whole array.

### Issue 5: Cash Flow — depositsReceived duplicates otherServiceIncome

Line 262 uses identical categories to line 245 (`platform_service_income`, `landlord_platform_fee`, `management_fee`). Currently 0 so no visible impact, but would double-count if these categories get used.

**Fix**: Remove `depositsReceived` or give it distinct categories.

---

### Implementation Plan

**Step 1: Fix `sumWithDirectionFallback` (per-category fallback)**
In `src/hooks/useFinancialStatements.ts`, change the function to iterate each category individually:
```
sum = categories.reduce((total, cat) => {
  const preferred = sumBy(preferredRows, [cat]);
  return total + (preferred > 0 ? preferred : sumBy(fallbackRows, [cat]));
}, 0);
```

**Step 2: Restructure Cash Flow sections**
- Remove `rent_repayment` from operating activities
- Remove `depositsReceived` (duplicate)
- Add a new "Facilitation Activities" section with:
  - `rent_repayment` (inflow from tenants)
  - `pool_rent_deployment` (outflow to landlords)
  - Net facilitation = repayments − deployments
- Update `netCashMovement` to be operating-only for "Platform Cash Movement"
- Show facilitation and financing as separate line items below

**Step 3: Update Cash Flow UI component**
- Add the "Facilitation Activities" section to the Cash Flow view
- Separate "Platform Operating Cash" closing balance from total movement across all scopes

**Step 4: Update TypeScript interfaces**
- Add `facilitationActivities` to `CashFlowData` interface
- Update the UI component rendering the Cash Flow tab

### Files to change
- `src/hooks/useFinancialStatements.ts` — core logic fixes
- Cash Flow UI component (need to identify which component renders the Cash Flow tab)

