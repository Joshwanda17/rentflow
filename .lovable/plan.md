# Fix "Nearing Payouts" Using next_roi_date Instead of maturity_date

## Problem

The "nearing payouts" logic in both `PartnersOpsDashboard` and `PartnerOpsBrief` filters on `maturity_date` — the portfolio's **end date** (months/years away). The actual next payout date is `next_roi_date`, which is a column on `investor_portfolios` that tracks when the next monthly ROI payment is due. Since today's payouts have a `next_roi_date` of today, but a `maturity_date` far in the future, they never appear.

## Changes

### 1. `src/components/executive/PartnersOpsDashboard.tsx`

- **Add `next_roi_date**` to the select query (currently missing)
- **Fix `nearingPayoutsList**`: filter on `next_roi_date` instead of `maturity_date` — show portfolios where `next_roi_date` is within the next 7 days (including today)

### 2. `src/components/executive/PartnerOpsBrief.tsx`

- **Fix the "maturing soon" query**: change from filtering on `maturity_date` to filtering on `next_roi_date` within 7 days, so the brief card shows the correct count of upcoming filter both or allow the coo or partner Ops to choose date  payouts to see the partners to pay


| File                       | Change                                                                   |
| -------------------------- | ------------------------------------------------------------------------ |
| `PartnersOpsDashboard.tsx` | Add `next_roi_date` to select; filter nearing payouts on `next_roi_date` |
| `PartnerOpsBrief.tsx`      | Query `next_roi_date` range instead of `maturity_date`                   |
