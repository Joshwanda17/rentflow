

## Fix: 30-Day Payout System for Funders

### Problem
The current system calculates the first payout by finding the next occurrence of `payout_day` (e.g., the 15th) that is at least 30 days away. This means if someone invests on March 10th with payout_day=15th, their first payout lands on April 15th (36 days), not exactly 30 days. The month-by-month projection also anchors to `payout_day` rather than the actual 30-day cycle.

### Solution
Adopt a strict **30-day cycle** from the investment date for all payout calculations — both in the backend (edge functions) and the frontend (breakdown UI).

### Changes

**1. `create-investor-portfolio/index.ts`** — Already sets `next_roi_date = now + 30 days`. This is correct. No change needed here.

**2. `fund-rent-pool/index.ts`** — Currently uses a complex `payout_day` alignment loop. Change to simply set `next_roi_date` to investment date + 30 days, keeping subsequent payouts every 30 days.

**3. `agent-invest-for-partner/index.ts`** — Same fix: replace the `payout_day` alignment logic with a strict 30-day first payout calculation.

**4. `process-supporter-roi/index.ts`** — The ROI processor for rent_requests currently checks `next_roi_due_date` or falls back to "one full month from funded_at." Update to use a strict 30-day interval check instead of calendar month alignment.

**5. `InvestmentBreakdownSheet.tsx` (UI)** — Update the compound growth projection and the "Next Payout" display to use 30-day intervals from the investment date instead of aligning to a calendar day. Month 1 = invested_at + 30 days, Month 2 = invested_at + 60 days, etc.

### Technical Detail

```text
Current Flow:
  Invested Mar 10 → payout_day=15 → first payout Apr 15 (36 days)
  Subsequent: May 15, Jun 15, Jul 15...

New Flow:
  Invested Mar 10 → first payout Apr 9 (30 days)
  Subsequent: May 9, Jun 8, Jul 8... (every 30 days)
```

All five files will be updated to use this consistent 30-day cycle. The `payout_day` field will still be stored for reference but won't drive the actual payout schedule — the `next_roi_date` (derived from invested_at + 30-day multiples) will be the single source of truth.

