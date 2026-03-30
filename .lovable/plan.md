

# Add Payment Date Range Filter — COO Partners Table

## What Changes

Add a date range picker filter to the partners table that lets the COO select a start and end date, filtering partners whose **payout day** falls within that window. This helps identify partners nearing or currently in their payment period.

## Implementation (`src/components/coo/COOPartnersPage.tsx`)

### 1. Add date range state
Add two new state variables: `payoutDateFrom` and `payoutDateTo` (both `Date | undefined`). These represent the calendar date range the COO selects.

### 2. Add date range filter UI
After the existing contact filter dropdown (line ~1180), insert a date range picker using two `Popover` + `Calendar` components (start date / end date). Use the `CalendarDays` icon already imported. Show a "Clear" button when a range is active.

### 3. Filter logic
In the `processed` useMemo (line ~815), add logic:
- For each partner row, compute their **next payout date** from `payoutDay` (same logic already used at line 1431-1434):
  - Take current month's `payoutDay`; if that date has passed, use next month
- If `payoutDateFrom` and/or `payoutDateTo` are set, filter partners whose next payout date falls within the range
- Make the `payoutDay` column the default sort when a date range is active

### 4. Default sort by payout date
When the date range filter is applied, auto-set `sortKey` to `'payoutDay'` and `sortDir` to `'asc'` so partners closest to payout appear first.

## Files Changed
- `src/components/coo/COOPartnersPage.tsx` — add state, filter UI, filter logic

## No database changes needed

