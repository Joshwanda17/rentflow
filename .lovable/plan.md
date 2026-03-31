

# Fix Next Payout Date: Roll Forward Stale `next_roi_date`

## Problem

The `next_roi_date` stored in the database is never automatically advanced each month. For example, ASIIMWE PAMELA contributed on **Jan 7, 2026**, so her `next_roi_date` was set to **Feb 7, 2026**. Since no compound/payout action was taken to advance it, the code still reads **Feb 7** — a date in the past. This causes:

1. The partner table shows a backward payout date (Feb instead of Apr)
2. The "Nearing Payouts" filter misses her entirely (since `du` is negative, she's excluded by `du >= 0`)

## Root Cause

Line 404 in `COOPartnersPage.tsx`:
```typescript
if (p.next_roi_date) {
  effectiveNextDate = p.next_roi_date; // Uses stale date as-is
}
```

No roll-forward logic exists. The date only advances when COO manually clicks "Compound" or "Pay to Wallet".

## Fix

**File: `src/components/coo/COOPartnersPage.tsx`**

Create a utility function that takes a stored `next_roi_date` (or derives one from `created_at`) and rolls it forward month-by-month until it lands on today or in the future. This ensures:

- A portfolio with `next_roi_date = 2026-02-07` and today being `2026-03-31` → computes next payout as **2026-04-07**
- A portfolio with `next_roi_date = 2026-03-28` → stays as **2026-03-28** (still upcoming)
- Uses `payout_day` (capped at 28) as the anchor day

Apply this function in **three places**:
1. The nearing payouts builder (line ~402-410) — so the filter and cards show the correct future date
2. The partner table row builder (line ~326-340) — so the table column shows the correct date
3. The detail view payout display (line ~1570) — so clicking into a partner shows the right date

The function logic:
```text
function getNextPayoutDate(nextRoiDate: string | null, createdAt: string, payoutDay: number): string {
  // Determine anchor day (from payout_day or created_at day, capped at 28)
  // Start from next_roi_date if available, else created_at + 1 month
  // While date < today, advance by 1 month
  // Return the first date that is >= today
}
```

No database migration needed — this is a display-time calculation that compensates for un-advanced `next_roi_date` values.

---

**Files to modify:** `src/components/coo/COOPartnersPage.tsx`

