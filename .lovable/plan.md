

# Fix Nearing Payouts to Use Rolled-Forward Dates

## Problem
The nearing payouts dialog uses the raw `next_roi_date` from the database, while the investment portfolio detail uses `getNextPayoutDate()` which rolls stale dates forward month-by-month until they're >= today.

Example: MWAKA ISAAC has `next_roi_date = "2026-02-07"` in the DB. The portfolio view rolls this to `2026-04-07` (today), but the nearing payouts shows `Feb 7` and marks it as ~59 days overdue.

## Root Cause
In `fetchData` (line 431-449), both `daysUntil` and `nextPayoutDate` are computed from the raw `p.next_roi_date`. They should instead use the rolled-forward date from `getNextPayoutDate()`.

## Fix — `src/components/coo/COOPartnersPage.tsx` (lines ~431-449)

Replace the raw date usage with the rolled-forward date:

```typescript
// BEFORE (line 431-433, 449):
const roiDate = dateOnlyToLocalDate(p.next_roi_date);
const diffMs = roiDate.getTime() - now.getTime();
const du = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
...
nextPayoutDate: p.next_roi_date,

// AFTER:
const effectiveNextDate = getNextPayoutDate(p.next_roi_date, p.created_at, p.payout_day ?? 15);
const roiDate = dateOnlyToLocalDate(effectiveNextDate);
const diffMs = roiDate.getTime() - now.getTime();
const du = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
...
nextPayoutDate: effectiveNextDate,
```

This ensures:
- `daysUntil` is computed from the same rolled-forward date the portfolio view shows
- The "Payout Date" cell in the dialog matches what the portfolio detail displays
- Portfolios like MWAKA ISAAC with payout day 7 show as "Due Today" on April 7th instead of "59d overdue"

| File | Change |
|---|---|
| `COOPartnersPage.tsx` (~line 431-449) | Use `getNextPayoutDate()` for `daysUntil` and `nextPayoutDate` instead of raw `p.next_roi_date` |

Single file, 3-line change. No database or logic changes elsewhere.

