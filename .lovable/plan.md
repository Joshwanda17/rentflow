

## Replace PDF Button with "Apply Pending Principal" Action

### Overview
Remove the PDF download button from investment portfolios in both COO Partners Page and Partner Operations (Manager) dashboard. Replace it with a button that lets operations manually merge approved pending top-ups into the portfolio principal, requiring a reason before applying.

### New Edge Function: `merge-pending-topups`

Creates `supabase/functions/merge-pending-topups/index.ts` — a manual version of the merge logic currently in `process-supporter-roi` (lines 260-395). This function:

1. Authenticates caller and verifies role (coo, manager, operations, super_admin)
2. Accepts `portfolio_id` and `reason` (min 10 chars)
3. Fetches all `approved` pending_wallet_operations for the portfolio with `operation_type = 'portfolio_topup'`
4. If none found, returns error
5. Updates `investor_portfolios.investment_amount` by adding total pending amount
6. Marks pending ops as `status: 'completed'` with `reviewed_by` set to the caller
7. Creates balanced ledger entries: `pending_portfolio_topup` (cash_out) + `partner_funding` (cash_in) — same pattern as the ROI merge engine
8. Creates audit log with action_type `manual_merge_pending_topups` including reason
9. Notifies the partner about the merge
10. Returns updated capital amount

### Frontend Changes

**`src/components/coo/COOPartnersPage.tsx`** (~line 1968-1983):
- Remove the PDF button and its `downloadPortfolioPdf` call
- Add an "Apply Top-up" button (visible only when `approvedTopUps[p.id]?.total > 0`)
- Button opens a small dialog/popover asking for a reason (textarea, min 10 chars)
- On submit, calls `supabase.functions.invoke('merge-pending-topups', { body: { portfolio_id, reason } })`
- On success, refreshes portfolio data and shows toast
- Button styled with primary/amber color with a merge icon

**`src/components/manager/InvestmentAccountsManager.tsx`** (~line 229-243):
- Same replacement: remove PDF button, add "Apply Top-up" button with identical logic
- Needs to fetch `approvedTopUps` state (query pending_wallet_operations with status 'approved' for each portfolio)

### Technical Details

- The merge ledger pattern mirrors `process-supporter-roi` exactly: `pending_portfolio_topup` cash_out + `partner_funding` cash_in
- Pending ops marked as `completed` (not `approved`) to distinguish manual merges from automated ones
- Rollback: if the pending ops status update fails after principal update, revert `investment_amount`
- The button is conditionally rendered — only shows when there are approved pending top-ups for that portfolio

### Files
- **New**: `supabase/functions/merge-pending-topups/index.ts`
- **Edit**: `src/components/coo/COOPartnersPage.tsx` — replace PDF button with Apply Top-up
- **Edit**: `src/components/manager/InvestmentAccountsManager.tsx` — replace PDF button with Apply Top-up

