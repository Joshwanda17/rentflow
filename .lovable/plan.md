# Connect "Total Money in All Wallets" → Wallet Deductions

The hero card "TOTAL MONEY IN ALL WALLETS" on the Financial Ops home is currently passive (just numbers + auto-refresh toggle). The user wants it to act as a doorway into the **Wallet Deductions** tool (currently buried behind the "More" sheet). Tapping the hero opens the same Wallet Deductions screen shown in the second screenshot.

## What changes

- The big purple hero card becomes clickable. Tapping anywhere on its main body (title + total + wallet/active counts) opens Wallet Deductions.
- The two inner stat tiles ("Awaiting verification" / "Awaiting payout") and the auto-refresh `Live` switch keep their existing behavior — clicks on those do NOT trigger navigation (event isolation).
- A small visual affordance is added to the hero so operators see it's interactive: a subtle hover lift, a `MinusCircle` chevron-style hint chip in the header reading "Tap to deduct", and a `cursor-pointer` + focus ring for keyboard users.

## Behavior

- Click / Enter / Space on the hero → calls a new `onOpenDeductions` callback.
- `FinancialOpsCommandCenter` passes a callback that does `setActiveTool('deductions')`, which already routes to the existing `WalletDeductionPanel` view (the screen in image 2 — no changes needed there).
- The two nested stat tiles wrap their `onClick`s with `e.stopPropagation()` so they remain independently clickable in the future without firing the parent.
- The Live/Paused `<label>` already swallows clicks via the `<Switch>`, but we'll add `e.stopPropagation()` on the label to be safe.

## Files

- `src/components/financial-ops/WalletOverviewCard.tsx`
  - Add optional prop `onOpenDeductions?: () => void`.
  - Wrap the outer `<div>` as a `<button type="button">` (or keep `<div role="button" tabIndex={0}>` to preserve the existing layout) with `onClick`, `onKeyDown` (Enter/Space), `cursor-pointer`, hover state (`hover:border-primary/60 hover:shadow-md transition-all`), and a focus ring.
  - Add a small "Tap to deduct" hint pill on the right side of the header (next to the Live toggle) using `MinusCircle` icon, muted styling.
  - Add `stopPropagation` on the auto-refresh label.

- `src/components/financial-ops/FinancialOpsCommandCenter.tsx`
  - Pass `onOpenDeductions={() => openTool('deductions')}` to `<WalletOverviewCard />`.

## Technical notes

- No DB / RPC changes. Wallet Deductions tool is already wired (`activeTool === 'deductions'` renders `<WalletDeductionPanel />`).
- Keep the card backwards-compatible: if `onOpenDeductions` is undefined, the card renders as a plain non-interactive panel (same as today). This avoids breaking any other surface that might mount `WalletOverviewCard`.
- Accessibility: `role="button"`, `aria-label="Open Wallet Deductions"`, visible focus ring, `tabIndex={0}`.
- Keep the existing auto-refresh toggle, totals, and the two inner tiles untouched visually — only add the hover/hint affordance and the wrapping click handler.
