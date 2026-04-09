

# Hide Fee Breakdown Details from Tenant-Facing Summaries

## Problem
The repayment summary cards currently show Access Fee, Platform Fee, and Total Repayment to users. These should be hidden — only **Rent Amount**, **Daily Amount**, and **Start Date** should remain visible.

## Files to Update

### 1. `src/pages/RegisterTenantPublic.tsx` (lines 395-397)
Remove three lines:
- `Access Fee` row
- `Platform Fee` row  
- `Total Repayment` row (with its border/separator styling)

Keep: Rent Amount, Daily Amount, Starts date.

### 2. `src/components/tenant/RentRequestForm.tsx` (lines 426-438)
Remove:
- `Access Fee` row
- `Request Fee` row
- `Total to Repay` block (the bordered highlight card)

Keep: Rent Amount, Daily Amount hero card, Start Date, Per-Payment info.

### 3. `src/components/agent/ListEmptyHouseDialog.tsx` (lines 390-396)
Remove:
- `Access fee (33%)` row
- `Platform fee` row

Keep: Rent Amount and any daily/total display that remains.

## No backend changes needed
The fees are still calculated and stored — they're just hidden from the user-facing summary display.

