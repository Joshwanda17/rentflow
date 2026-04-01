

# Fix: Fund Account Button Hidden on Mobile

## Problem
The FundAccountDialog content overflows the mobile viewport. When the ROI preview section is visible (valid amount entered), it pushes the "Fund Account" button below the visible area. The first screenshot confirms this — the button is completely cut off on Brenda's phone.

## Root Cause
The `DialogContent` has no scroll capability, so on small screens the content + footer exceeds the viewport height.

## Fix — Single File Change

### `src/components/supporter/FundAccountDialog.tsx`
- Add `max-h-[90vh] overflow-y-auto` to the `DialogContent` so the entire dialog scrolls within the viewport
- Reduce vertical spacing from `space-y-5 py-4` to `space-y-3 py-2` to be more compact on mobile
- Reduce ROI preview padding from `p-4` to `p-3`
- This ensures the footer with "Fund Account" button is always reachable by scrolling

