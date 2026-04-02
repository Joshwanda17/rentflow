

# Show Full Balance Value on All Devices

## Change

In `src/components/supporter/PortfolioSummaryCards.tsx`, replace the two conditional `<span>` elements (compact on mobile, full on desktop) with a single `<span>` that always shows `formatAmount(walletBalance)`. Use responsive font sizing and `truncate` to prevent overflow on small screens.

### File: `src/components/supporter/PortfolioSummaryCards.tsx` (lines 59-63)

Replace:
```tsx
<div className="flex items-baseline gap-2">
  <p className="text-[clamp(1.5rem,6vw,2.25rem)] font-black tracking-tight leading-none text-white truncate">
    <span className="sm:hidden">{formatAmountCompact(walletBalance)}</span>
    <span className="hidden sm:inline">{formatAmount(walletBalance)}</span>
  </p>
</div>
```
With:
```tsx
<div className="flex items-baseline gap-2 min-w-0 w-full">
  <p className="text-[clamp(1.1rem,4.5vw,2.25rem)] font-black tracking-tight leading-none text-white truncate w-full">
    {formatAmount(walletBalance)}
  </p>
</div>
```

- Removes the mobile/desktop split — full value shown everywhere
- Slightly reduced `clamp` lower bound (`1.1rem`) and vw factor (`4.5vw`) so long numbers fit on small screens
- `min-w-0` + `w-full` + `truncate` prevent overflow

### Files Modified
- `src/components/supporter/PortfolioSummaryCards.tsx`

