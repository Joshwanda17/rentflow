# Make Funder Dashboard Digits & Text Responsive

## Problem

Large numbers on the Funder (Supporter) dashboard overflow on mobile screens (391px viewport). Values like "USh 7,580,000" are too long and get truncated or break layout. The user wants compact formatting like "7.58M" and responsive text sizing throughout.

this must only be on mobile devices or small screens

## Changes

### 1. `src/components/supporter/PortfolioSummaryCards.tsx`

- **Main balance**: Use `formatAmountCompact` instead of `formatAmount` for the hero balance when value >= 100,000 (so "USh 758,000" becomes "758K", "USh 7,580,000" becomes "7.6M")
- **Stats grid values**: Already using `formatAmountCompact` — no change needed
- **Portfolio footer**: Already compact — no change needed

### 2. `src/components/supporter/OpportunitySummaryCard.tsx`

- **Total Rent Demand**: Switch from `formatAmount` to `formatAmountCompact` for the main figure (line 59)
- **Min amount footer**: Switch to `formatAmountCompact` (line 128)
- Reduce font size on the main figure to `text-lg sm:text-2xl` for better fit

### 3. `src/components/agent/FunderPortfolioCard.tsx`

- Replace all `formatUGX(...)` calls with `useCurrency().formatAmountCompact(...)` so values like "2,500,000" display as "2.5M"
- Add `truncate` to value text elements to prevent overflow

### 4. `src/hooks/useCurrency.tsx` — Improve compact formatting precision

- Update `formatAmountCompact` to show 2 decimal places for millions (e.g., "7.58M" instead of "7.6M") to match the user's expectation
- Current: `(converted / 1000000).toFixed(1)` → Change to `.toFixed(2)` for M values
- Keep 1 decimal for B values, 0 for K values

### 5. General text responsiveness

- Add `truncate` or `text-[clamp(...)]` to any remaining value displays in the dashboard
- Ensure all stat labels use responsive font sizes (`text-[10px]` or `text-xs`)

## Files to Edit

- `src/hooks/useCurrency.tsx` — improve compact format precision for M values
- `src/components/supporter/PortfolioSummaryCards.tsx` — use compact format for main balance
- `src/components/supporter/OpportunitySummaryCard.tsx` — use compact format for rent demand
- `src/components/agent/FunderPortfolioCard.tsx` — switch to compact currency formatting