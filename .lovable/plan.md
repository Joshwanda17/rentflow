

# Add Date Range Filter to Nearing Payouts (Including Past-Due)

## Problem
The nearing payouts list only shows portfolios with `next_roi_date` between today and 30 days ahead (`du >= 0 && du <= 30`). Past-due/missed payouts (where `next_roi_date` is in the past) are completely hidden.

## Changes

### 1. `src/components/coo/COOPartnersPage.tsx` — Data fetch (lines ~420-455)
- Remove the `du >= 0 && du <= 30` filter so ALL active portfolios with a `next_roi_date` are collected into the nearing list (both past-due and future)
- Allow negative `daysUntil` values (negative = overdue by N days)

### 2. `NearingPayoutsDialog` — Add range dropdown
- Add a `Select` dropdown at the top with options: **Overdue**, **7 days**, **14 days**, **30 days**, **All**
- Default to **7 days**
- Filter logic:
  - **Overdue** → `daysUntil < 0` (missed payouts only)
  - **7 days** → `daysUntil >= -30 && daysUntil <= 7` (past 30 days missed + next 7 days)
  - **14 days** → `daysUntil >= -30 && daysUntil <= 14`
  - **30 days** → `daysUntil >= -30 && daysUntil <= 30`
  - **All** → no filter
- Apply this filter alongside the existing search filter

### 3. `NearingPayoutsDialog` — Visual distinction for overdue items
- Overdue portfolios (`daysUntil < 0`) get a red "Overdue" badge and show "X days overdue" instead of "in X days"
- Today's payouts get an amber "Due Today" badge

### 4. `NearingPayoutsCard` — Update count and label
- Pass filtered count or show total with a note like "3 overdue" if any are past-due
- Update subtitle to reflect the range

| File | Change |
|---|---|
| `COOPartnersPage.tsx` (fetchData ~line 435) | Remove `du >= 0 && du <= 30` gate, allow all active portfolios with `next_roi_date` |
| `COOPartnersPage.tsx` (NearingPayoutsDialog) | Add range Select dropdown, filter by range, style overdue items |
| `COOPartnersPage.tsx` (NearingPayoutsCard) | Show overdue count highlight |

**No database changes needed.**

