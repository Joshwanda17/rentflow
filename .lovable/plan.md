## Goal
Make the **Nearing Payout** card on COO → Partner Management show an accurate count of portfolios whose **Next Payout Date falls on today**, derived from the same `getNextPayoutDate` logic the rest of the page uses, with no schema changes.

## Current behaviour (audit)

File: `src/components/coo/COOPartnersPage.tsx`

- `fetchNearingPayoutsAsync` (lines 600–645) loads **every active portfolio owned by a supporter**, then for each one computes:
  - `effectiveNextDate = getNextPayoutDate(p.next_roi_date, p.created_at, p.payout_day ?? 15)` (lines 53–70 — never rolls forward, preserves overdue dates).
  - `daysUntil = ceil((effectiveNextDate − today) / 1 day)`.
- `NearingPayoutsCard` (lines 3275–3334) already filters `daysUntil === 0` and labels the tile **"Payouts Due Today"**.

So the count *intends* to be "today only", but three integrity issues remain:

1. **Time-zone drift.** `roiDate.getTime() − now.getTime()` divided by 86 400 000 then `Math.ceil` gives wrong buckets across DST/timezone boundaries. For a portfolio whose `next_roi_date = 2026-05-12` evaluated at 23:30 UG time, `Math.ceil` can return `0` or `1` inconsistently. Should compare on `YYYY-MM-DD` strings instead.
2. **Excluded portfolios that should count.** Anything with `next_roi_date IS NULL` and `created_at` not yet one month old is silently skipped (line 611). For a portfolio created on the 12th of last month with `payout_day = 12` and null `next_roi_date`, today *is* the first payout but the card misses it.
3. **Status filter is too narrow.** Only `status === 'active'` counts. A portfolio in `pending_approval` / `processing` whose payout date is today is silently dropped from the count even though it shows in the dialog.

## Plan (UI / presentation layer only)

All edits stay inside `src/components/coo/COOPartnersPage.tsx` and `src/lib/supabaseBatchUtils.ts`. No new tables, no schema changes, no RLS work.

### 1. Single source of truth for "is this portfolio due today?"

Add one small helper next to `getNextPayoutDate`:

```ts
function isDueToday(p: PortfolioRow): boolean {
  const next = getNextPayoutDate(p.next_roi_date, p.created_at, p.payout_day ?? 15);
  return next === formatLocalDateOnly(new Date()); // string compare in local TZ → no DST drift
}
```

Reuse it in:
- `NearingPayoutsCard` (replace `daysUntil === 0` filter).
- `fetchNearingPayoutsAsync` enrichment (still build `daysUntil` for the dialog, but compute `dueToday: boolean` once via the helper so card and dialog can never disagree).

### 2. Fix the data-fetch gaps in `fetchAllNearingPayoutPortfolios`

In `src/lib/supabaseBatchUtils.ts`:

- Drop the `.eq('status', 'active')` filter and instead pass the status through; `NearingPayoutPortfolio` already carries `status`. The card will count portfolios whose status is `active` **or** `awaiting_payout` / `processing_payout` (whatever pending payout states exist — confirm with one `SELECT DISTINCT status FROM investor_portfolios` before coding).
- Keep the dedupe block as-is.

### 3. Use the helper inside the enrichment loop

In `fetchNearingPayoutsAsync` (lines 600–645):
- Remove the `if (!p.next_roi_date) return;` early exit so portfolios with null `next_roi_date` but a derivable first payout are included.
- Compute `dueToday` via the helper instead of `daysUntil === 0`.
- Keep the `daysUntil` field for sorting + the dialog ranges.

### 4. Card display

In `NearingPayoutsCard`:
- Filter on `p.dueToday === true`.
- Keep the existing label ("Payouts Due Today") and the existing total-amount sum, but compute the amount from a single helper so card + dialog match.
- Tooltip / aria-label: `"<n> portfolio(s) reach their Next Payout Date today (<formatted today date>)"` so the user can verify what "today" resolves to in the browser TZ.

### 5. Integrity guard rails

- After computing the list, log to console (dev only) `console.debug('[NearingPayout] today=%s, dueToday=%d, totalActive=%d', todayStr, dueTodayCount, portfolios.length)` so we can spot regressions in the live preview without adding analytics.
- Add a unit-style sanity assertion in dev: if any portfolio has `dueToday === true` but `daysUntil !== 0`, log a warning — that means the helper and the diff drifted.

## Verification

1. Open `/coo-dashboard` → Partner Management. The tile should show the count for today.
2. Cross-check with read-only SQL:
   ```sql
   SELECT count(*) FROM investor_portfolios
   WHERE status = 'active'
     AND coalesce(next_roi_date::date,
                  (date_trunc('month', created_at) + interval '1 month'
                   + (least(coalesce(payout_day,15),28) - 1) * interval '1 day')::date)
         = current_date;
   ```
   Numbers must match the card.
3. Open the dialog → "Today" filter → row count must equal the card number.
4. Pick one portfolio whose `next_roi_date = today` and confirm it appears; pick one with `next_roi_date = today − 1` and confirm it does **not** count toward the card (still listed under "Overdue" in the dialog).

## Out of scope

- No schema changes, no new tables.
- No changes to payout execution / ledger logic.
- Overdue handling in the dialog stays exactly as-is.
