

# Compact Money Values in My Support Accounts

## What Changes

All money values in the **Support Accounts** tab (summary row + each account card) will display in compact format (e.g., **1.508M** instead of **1,508,000**). Tapping any value toggles it to show the full amount, and tapping again returns to compact.

## How It Works

### New reusable component: `CompactAmount`

A small inline component that wraps any currency value:

```
src/components/ui/CompactAmount.tsx
```

- Renders `formatAmountCompact(value)` by default
- On click/tap, toggles to `formatAmount(value)` (full figure)
- Tap again returns to compact
- Subtle underline-dotted style to hint it's tappable
- Uses `useCurrency` hook internally

### Where values get updated

**File: `src/components/supporter/InvestmentBreakdownSheet.tsx`**

Replace `formatAmount(...)` calls with `<CompactAmount value={...} />` in:

1. **Summary row** (lines ~167, 172, 177) — Capital, Earned, Monthly
2. **Account cards — Capital** (line ~297)
3. **Account cards — Monthly return** (line ~303 area)
4. **Account cards — Total earned** (within the accordion details)
5. **Any other money display** inside the Support Accounts tab

The Angel Shares tab and other components remain unchanged.

### Files

| Action | File |
|--------|------|
| Create | `src/components/ui/CompactAmount.tsx` |
| Modify | `src/components/supporter/InvestmentBreakdownSheet.tsx` — swap `formatAmount()` calls to `<CompactAmount>` |

