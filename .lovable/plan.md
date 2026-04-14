

## Plan: Make CFO Dashboard Fully Mobile & Desktop Responsive

### Problem
The CFO dashboard is *functional* on mobile (hamburger nav works, content scrolls), but has layout issues that hurt usability:
1. **MetricCards overflow** — The horizontal flex layout (icon + label + value) cramps on small screens, causing text to wrap awkwardly ("Money We Have" breaks across 3 lines)
2. **Operation toggle buttons truncate** — "Platform → Wallet" text gets cut off on narrow screens
3. **Double-entry summary grid overflows** — The `grid-cols-[auto_1fr]` layout in DirectCreditTool can overflow on mobile
4. **No sticky "Send Money" quick action on mobile** — The CFO's primary action (paying users) requires scrolling back to top or opening the sidebar

### Changes

**1. Fix MetricCard layout in `CFOOverviewDashboard.tsx`**
- Switch MetricCard from horizontal flex to a stacked layout on mobile: icon + label on top, value below
- Use responsive classes: `flex-col sm:flex-row` so desktop keeps the current horizontal layout
- Ensure large currency values use `text-base sm:text-lg` to prevent overflow

**2. Fix DirectCreditTool mobile layout**
- Change operation toggle buttons text to shorter labels on mobile: "Credit" / "Debit" with icons (keep full text on `sm:` and up)
- Add `overflow-x-auto` on the double-entry summary grid
- Ensure quick-amount buttons wrap properly with `flex-wrap`

**3. Add floating "Pay" FAB on mobile overview**
- Add a sticky floating action button (FAB) at the bottom-right of the CFO overview on mobile only (`lg:hidden`)
- Tapping it navigates to the `wallet-payout` tab
- This gives the CFO instant access to the most critical action from anywhere on the dashboard

**4. Ensure all sub-pages have "Back to Treasury" on mobile**
- Already exists on the wallet-payout page — verify other sub-pages (rent-payouts, withdrawals, etc.) also have a back button visible on mobile, since the sidebar is hidden

### Files Modified
- `src/components/cfo/CFOOverviewDashboard.tsx` — MetricCard responsive layout + FAB
- `src/components/cfo/DirectCreditTool.tsx` — Mobile button labels + summary overflow fix

