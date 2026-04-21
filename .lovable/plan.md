

## Surface ROI Payout Queue inside Send Money

When the CFO selects **📈 ROI Payout** as the category in the **Send Money** tab, the COO-approved ROI requests (the rows currently visible only on the standalone "ROI Payout — Expense" tab) will appear inline — exactly the same pattern as Rent Disbursement and Business Advance already work today.

### What the CFO will see

Picking "📈 ROI Payout" hides the manual user-search / amount / reason form and instead renders the queue of COO-approved ROI payouts (status `coo_approved` in `pending_wallet_operations`, category `roi_payout`):

- **Category dropdown gets a counter**: `📈 ROI Payout — Expense • 3 ready` (matches the existing rent/business-advance pattern).
- **Inline queue cards**: partner → proxy agent (if any), amount, portfolio code, reason, treasury impact banner, and an **Approve** / **Reject** action per row.
- Approving routes through the existing `approve-wallet-operation` edge function — the same path the standalone tab already uses, so the money flow, ledger entries, bucket reconciliation, and audit log are unchanged.
- Rejecting still requires the 10-char reason captured per row.

The standalone **CFO ROI Requests** tab stays as-is for power users who want a dedicated screen — Send Money becomes a second, faster entry point.

### Files touched

1. **New component `src/components/cfo/ROIPayoutQueue.tsx`** — a compact embeddable wrapper around the same query + mutation logic that powers `CFOROIRequests` (filter pinned to `coo_approved`, no header chrome). Reuses `TreasuryImpactBanner`.
2. **`src/components/cfo/DirectCreditTool.tsx`**
   - Add `roiPayoutQueueCount` query (count of `pending_wallet_operations` where `category = 'roi_payout'` AND `status = 'coo_approved'`).
   - Append the count to the `roi_payout` option label in the category dropdown (`• N ready`).
   - Treat `roi_payout` as a queue category (`isQueueCategory = isRentDisbursement || isBusinessAdvance || isROIPayout`) so the manual form is hidden.
   - Render `<ROIPayoutQueue />` when `selectedCategoryId === 'roi_payout'`.

### Out of scope

- No changes to the `cfo-direct-credit` or `approve-wallet-operation` edge functions.
- No schema changes — we read the same `pending_wallet_operations` rows the standalone tab already consumes.
- The standalone `CFOROIRequests` tab is left intact.

