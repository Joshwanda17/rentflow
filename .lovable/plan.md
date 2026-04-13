

## Plan: Move `next_roi_date` Advancement to CFO Approval

### Problem
Lines 2677-2679 (`handlePay`) and 2848-2856 (`handleSplitPayout`) in `COOPartnersPage.tsx` advance `next_roi_date` immediately when COO initiates a payout — before the CFO approves it. Additionally, `getNextPayoutDate()` (lines 65-67) silently rolls stale dates forward, hiding partners who were missed.

### Changes

**1. `src/components/coo/COOPartnersPage.tsx`** — 3 edits:

- **`getNextPayoutDate()` (line 65-67)**: Remove the `while (d < today)` auto-roll loop. Return the actual stored date so overdue/missed dates remain visible.

- **`handlePay()` (lines 2677-2679)**: Remove the immediate `next_roi_date` update. The date stays unchanged until CFO approves.

- **`handleSplitPayout()` (lines 2848-2856)**: Remove `next_roi_date` from the portfolio update. Only update `investment_amount` for the reinvest portion. Date advances on CFO approval.

**2. `supabase/functions/approve-wallet-operation/index.ts`** — 1 edit:

- After the ledger entries succeed for `roi_payout` category: advance `next_roi_date` by +1 month on the source portfolio (`op.source_id`). This is where the date should change — only after CFO confirms the payment.

**3. `src/components/coo/COOPartnersPage.tsx`** — UI enhancement:

- In the Nearing Payouts list, show a visual indicator (red "OVERDUE" badge) for portfolios whose `next_roi_date` is in the past, so COO/Partner Ops can clearly see who was missed and still needs to be paid.

### Behavior After Change

| Scenario | `next_roi_date` | What happens |
|---|---|---|
| COO initiates payout | **Unchanged** | Queued for CFO |
| CFO approves | **Advanced +1 month** | Wallet credited |
| Date passes, no action | **Unchanged** | Shows as OVERDUE |

### No database migration needed
The existing `next_roi_date` column is sufficient. No new columns required — the `pending_wallet_operations` status already tracks pending vs approved.

