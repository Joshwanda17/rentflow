

# Redesign Wallet Sheet to Match Reference

## What Changes

The `FullScreenWalletSheet` will be redesigned to match the clean, card-based layout from the reference image:

1. **Header**: Simplified top bar with avatar, app name ("Welile"), and notification bell
2. **Balance Card**: Purple gradient card showing "AVAILABLE BALANCE", large balance amount, and "Uganda Shillings" subtitle — replaces the current wide gradient header
3. **Deposit & Withdraw**: Two separate white cards stacked vertically, each with a centered icon and label (replacing the side-by-side grid)
4. **Wallet Statement Section**: "Wallet Statement" heading with "Updated just now" subtitle, containing an "ALL-TIME NET" summary card with the net amount and a trend icon
5. **Monthly Summary Card**: "SUMMARY FOR [Month Year]" with a progress bar showing spent vs goal, and a calendar icon
6. **Recent Transactions**: "Recent Transactions" heading with "View All →" link, followed by transaction rows showing icon, name, date/time, amount, and category label

## Technical Changes

### File: `src/components/wallet/FullScreenWalletSheet.tsx`

- **Header area** (lines 116-204): Replace the gradient header with a simple white top bar (avatar + "Welile" + bell icon + close button). Below it, render a standalone purple gradient rounded card for the balance display.
- **Scrollable content** (lines 206-300): Replace the "Pay for Anything" collapsible section and the 2-column Deposit/Withdraw grid with two stacked full-width cards — one for Deposit (purple plus icon) and one for Withdraw (gray icon).
- **Wallet Statement** (around line 299): Keep `WalletLedgerStatement` but wrap it with a new header style matching the reference ("Wallet Statement / Updated just now"). Add an all-time net summary card above it.
- **Monthly summary**: Add a new card showing current month, spent amount, goal amount, and a progress bar.
- **Transactions** (lines 302-370): Restyle transaction rows to show a colored category icon, name + date on the left, and amount + category tag on the right, matching the reference layout.

## Files Changed

- `src/components/wallet/FullScreenWalletSheet.tsx` — full redesign of layout and styling

