# Fix Next Payout Calculation and ALEETE LILIAN's Data

## Problem Identified

ALEETE LILIAN's portfolio (WIP2602283615) has incorrect stored data:

- `created_at`: 2026-02-28 (contribution date)
- `payout_day`: **1** (wrong -- should be **28**, derived from contribution date)
- `next_roi_date`: **2026-03-30** (wrong -- should be **2026-03-28**, exactly one month from Feb 28)

This means a previous operation (likely an edit or migration) corrupted the payout_day and next_roi_date. The contribution date itself (Feb 28) appears correct.

## Plan

### 1. Fix ALEETE LILIAN's data

Use the insert tool to correct her portfolio record:

- Set `payout_day = 28` (day of Feb 28)
- Set `next_roi_date = '2026-03-28'` (Feb 28 + 1 month)

Since March 28 has already passed (today is March 31), also check if `next_roi_date` should be advanced to April 28 (depends on whether payout was already processed).

### 2. Fix all portfolios with mismatched payout_day

Run a data correction query to update any portfolio where `payout_day` does not match the day-of-month from `created_at` (capped at 28). This catches other records with the same issue.

```sql
UPDATE investor_portfolios 
SET payout_day = LEAST(EXTRACT(DAY FROM created_at)::int, 28)
WHERE payout_day != LEAST(EXTRACT(DAY FROM created_at)::int, 28)
  AND status IN ('active', 'pending', 'pending_approval');
```

### 3. Fix portfolios with incorrect next_roi_date

For portfolios where `next_roi_date` doesn't align with the contribution date cycle, recalculate:

- The next_roi_date should always fall on the same day-of-month as the contribution date (capped at 28)
- If the stored next_roi_date day doesn't match, correct it

### 4. Add contribution date display to nearing payout cards

Currently the nearing payout cards don't show the contribution date. Add it so the COO can verify at a glance.

enable database transactions incase we need to revert back

---

**Files to modify:**

- Data fix via insert tool (steps 1-3)
- `src/components/coo/COOPartnersPage.tsx` -- add contribution date to payout cards