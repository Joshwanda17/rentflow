

## Plan: Add Compound ROI Breakdown to My Investments

### What changes

For investments with `roi_mode === 'compound'`, add a **month-by-month compound growth table** inside each investment card in `InvestmentBreakdownSheet.tsx`. This replaces the static "Expected / month" display with a detailed projection showing how the principal grows over time.

### UI Design

For compound investments, after the Capital & Expected return cards, insert a collapsible section titled **"Compound Growth Projection"** showing:

1. **Summary row**: Starting capital → Final value after N months (with total growth %)
2. **Month-by-month table** (collapsible via Accordion):
   - Columns: **Month** | **Opening Balance** | **ROI Earned** | **Closing Balance**
   - Each row shows how ROI is added back to principal
   - Final row highlighted with total earnings

For simple ROI investments, no changes — they keep the current display.

### Example for UGX 10,000,000 at 15% compound over 12 months:

```text
Month | Opening Balance | ROI (15%)   | Closing Balance
  1   | 10,000,000      | 1,500,000   | 11,500,000
  2   | 11,500,000      | 1,725,000   | 13,225,000
  3   | 13,225,000      | 1,983,750   | 15,208,750
 ...
 12   | ...              | ...         | ...
```

### Technical Changes

**File: `src/components/supporter/InvestmentBreakdownSheet.tsx`**

1. Import `Accordion`, `AccordionContent`, `AccordionItem`, `AccordionTrigger` from UI components
2. For compound entries, compute a month-by-month projection array:
   - Loop from month 1 to `duration_months`
   - `opening = previous closing` (start with `entry.amount`)
   - `earned = opening × (roi_percentage / 100)`
   - `closing = opening + earned`
3. Update the "Expected / month" card for compound entries to show "Month 1 Return" (first month's earnings) with a note that it grows each month
4. Add the collapsible projection table below the next payout section
5. Add a summary line showing **Total Projected Earnings** and **Final Portfolio Value**

### Visual Treatment
- Use a green gradient background for the projection section
- Bold the final month row
- Show a small "Compounding" badge with the Repeat icon on the section header
- Keep the table compact with `text-[11px]` sizing to fit mobile

