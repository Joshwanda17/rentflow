

# Show Compact Capital Value in Angel Shares Tab

## Change

On line 68 of `AngelSharesTab.tsx`, switch `formatAmount(totalInvested)` to `formatAmountCompact(totalInvested)` so it displays as e.g. **1.388M** instead of the full number.

Also need to destructure `formatAmountCompact` from `useCurrency()` on line 11.

### File: `src/components/supporter/AngelSharesTab.tsx`

- **Line 11**: Add `formatAmountCompact` to the destructured hook: `const { formatAmount, formatAmountCompact } = useCurrency();`
- **Line 68**: Change `{formatAmount(totalInvested)}` → `{formatAmountCompact(totalInvested)}`

