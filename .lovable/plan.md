

# Fix Payout Date Logic — Count One Month From Contribution Date

## Problem
When a portfolio is created with a contribution date (e.g., April 1st), the system stores a separate `payout_day` field (e.g., 28) which is manually entered. The "Nearing Payout" logic compares `payout_day` against today's date, causing incorrect results. TULLEN BEN's portfolio (WIP2603313481) was created for April 1st with `payout_day=28`, but `next_roi_date` is correctly May 1st — the nearing payout widget ignores `next_roi_date`.

## Root Cause
The nearing-payout calculation (line ~390) uses `p.payout_day - currentDay` to determine proximity. It should instead use `next_roi_date` which already represents the actual next payout date (one month from contribution).

## Plan

### 1. Fix "Add Portfolio" — Auto-set payout_day from contribution date
When creating a portfolio, instead of requiring a manual payout day input, automatically derive `payout_day` from the contribution date's day-of-month. If contribution is April 1st → `payout_day = 1`. Also ensure `next_roi_date` is exactly one month from contribution date (already works, but remove the override to `payoutDay` on line 739).

**Changes in `handleAddPortfolio`:**
- Remove the manual `addPortfolioPayoutDay` input from the form
- Auto-calculate: `payout_day = new Date(createdAt).getDate()` (capped at 28 for safety)
- `next_roi_date` = contribution date + 1 month (keep existing logic but use contribution day, not manual payout day)

### 2. Fix "Nearing Payout" logic — Use `next_roi_date` instead of `payout_day`
Change the nearing-payout filter to compare `next_roi_date` against today, rather than using `payout_day` arithmetic.

**Changes in the nearing payout calculation (~line 383-408):**
- Fetch `next_roi_date` in the portfolio query (already fetched in detail view but not in the list query on line 290)
- Add `next_roi_date` to the list query select
- Calculate `daysUntil` as: `differenceInDays(new Date(p.next_roi_date), today)`
- Filter: show if `daysUntil >= 0 && daysUntil <= 7`

### 3. Update the "Compound" and "Pay to Wallet" handlers
After processing a payout, advance `next_roi_date` by one month so the cycle continues correctly.

### 4. Remove payout day input from Add Portfolio dialog
Remove the manual "Payout Day" field from the create portfolio form since it's now auto-derived from the contribution date.

### 5. Fix existing data (TULLEN BEN)
Update portfolio WIP2603313481 to set `payout_day = 1` (matching the April 1st contribution date), confirming `next_roi_date` is already correct at May 1st.

---

**Files to modify:**
- `src/components/coo/COOPartnersPage.tsx` — all changes above
- Database update for existing incorrect records

