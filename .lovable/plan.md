

# Split ROI Payout Feature

## What it does
Adds a **"Split Payout"** option to the Nearing Payouts dialog, allowing an operator to split a partner's ROI return into two parts: one portion paid to the wallet (or agent wallet / cash), and the remainder compounded back into the portfolio principal.

Example: John Doe has UGX 2,000,000 returns due. Operator enters UGX 1,000,000 as cash payout → the other UGX 1,000,000 is automatically added to his principal.

## How it works today

The `NearingPayoutsDialog` in `COOPartnersPage.tsx` currently offers two buttons per portfolio:
- **Compound** — full ROI added to principal (direct DB writes, no CFO approval)
- **Pay** — full ROI submitted to `pending_wallet_operations` for CFO approval

Both are all-or-nothing. No partial amounts are supported.

## Implementation plan

### 1. Add "Split" button and step to NearingPayoutsDialog (~80 lines)

**File**: `src/components/coo/COOPartnersPage.tsx`

- Add a third button **"Split"** alongside Compound and Pay in each portfolio card (line ~2896)
- When clicked, transition to a new `paymentStep: 'split-config'` that shows:
  - A slider or numeric input for "Cash amount" (min 1, max ROI - 1)
  - Auto-calculated "Reinvest amount" = ROI - cash amount
  - Visual breakdown: "UGX X to wallet · UGX Y to principal"
  - Payment method selector (wallet / agent wallet / cash) for the cash portion
  - Confirm button

### 2. Add `handleSplitPayout` function

**File**: `src/components/coo/COOPartnersPage.tsx`

This function receives `(portfolio, cashAmount, reinvestAmount, reason, payMode)` and does two atomic operations:

**Operation A — Cash portion**: Insert into `pending_wallet_operations` with `operation_type: 'roi_split_cash'`, amount = cashAmount. This goes through the existing CFO approval pipeline. The description clearly states it's a split payout.

**Operation B — Reinvest portion**: Directly update `investor_portfolios.investment_amount += reinvestAmount` (same pattern as existing `handleCompound`). Insert an audit log entry with `action_type: 'roi_split_compound'`.

**Shared**: Advance `next_roi_date` by 1 month. Insert notifications to partner and CFO. Insert audit log with full split metadata (cash amount, reinvest amount, pay mode).

### 3. No new edge function needed

The split payout reuses the existing `pending_wallet_operations` → CFO approval pipeline for the cash portion, and the existing direct portfolio update pattern for the reinvest portion. Both patterns are already battle-tested in the codebase. No new ledger categories are needed — the cash portion uses `roi_payout` and the reinvest portion uses `roi_compounding`.

### 4. No database migration needed

The `pending_wallet_operations` table already has a `metadata` JSONB column where we store the split details. The `operation_type` field accepts text values. We'll use `roi_split_cash` to distinguish split payouts from full payouts in the CFO approval queue.

## Files changed

- **Edit**: `src/components/coo/COOPartnersPage.tsx` — Add Split button, split-config step, and `handleSplitPayout` function

## Ledger flow for a UGX 2M return split 1M/1M

```text
┌─────────────────────────────────────────────────┐
│ CASH PORTION (UGX 1,000,000)                    │
│ → pending_wallet_operations (roi_split_cash)    │
│ → CFO approves → ledger: roi_expense + wallet   │
│   credit via existing approval pipeline         │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ REINVEST PORTION (UGX 1,000,000)                │
│ → investor_portfolios.investment_amount += 1M   │
│ → audit_log: roi_split_compound                 │
│ → notification to partner                       │
└─────────────────────────────────────────────────┘

next_roi_date advanced by 30 days
Next cycle ROI = 15% × 21,000,000 = 3,150,000
```

