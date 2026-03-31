# Restructure Partner/Funder Withdrawal Approval Chain

## What Changes

**ensure you follow event based architecture**

**Current chain** for partner capital withdrawals (`investment_withdrawal_requests`):

- Submitted → lands in Financial Ops ApprovalQueue → single approve/reject (no multi-stage)

**New chain** (3-stage with creative labels):

1. **Requested** — Partner submits withdrawal
2. **Portfolio Review** — Partner Ops reviews (operations dept: partner-ops)
3. **Operations Clearance** — COO dashboard approves
4. **Treasury Payout** — CFO processes the actual payout

User-facing labels hide internal role names — no "CFO" or "COO" shown.

---

## Plan

### 1. Database Migration — Add approval stage columns to `investment_withdrawal_requests`

Add columns for multi-stage tracking:

- `partner_ops_approved_at`, `partner_ops_approved_by` (UUID)
- `coo_approved_at`, `coo_approved_by` (UUID)
- `cfo_processed_at`, `cfo_processed_by` (UUID)
- `rejection_reason` (text)

Update status flow to support: `pending` → `partner_ops_approved` → `coo_approved` → `approved` (final, after CFO payout)

### 2. Update `WithdrawalStepTracker` — Support partner withdrawal variant

Add a `variant` prop (`wallet` | `partner`). When `variant="partner"`:

- Step 1: **Requested** (User icon)
- Step 2: **Portfolio Review** (Briefcase icon) — instead of "Manager Review"
- Step 3: **Operations Clearance** (Shield icon) — instead of "CFO Review"  
- Step 4: **Treasury Payout** (Banknote icon) — instead of "COO Approval"

Map the timestamp props accordingly (`partnerOpsApprovedAt`, `cooApprovedAt`, `cfoProcessedAt`).

### 3. Update Partner Ops Dashboard — Add withdrawal review queue

In `PartnersOpsDashboard.tsx`, add a "Withdrawal Requests" section that:

- Queries `investment_withdrawal_requests` where `status = 'pending'`
- Shows partner name, amount, reason, days since request
- Approve action sets status to `partner_ops_approved` + timestamps
- Reject sets status to `rejected` with reason
- Logs to `audit_logs`

### 4. Update COO Dashboard — Add partner withdrawal stage

In `COOWithdrawalApprovals.tsx` (or a new sibling component):

- Query `investment_withdrawal_requests` where `status = 'partner_ops_approved'`
- Show as "Operations Clearance" queue (not "COO")
- Approve sets status to `coo_approved` + timestamps
- Forward to CFO for payout

### 5. Update CFO Dashboard — Add partner payout processing

Create or extend CFO withdrawal section to:

- Query `investment_withdrawal_requests` where `status = 'coo_approved'`
- Show as "Treasury Payout" queue
- Require transaction ID/proof before finalizing
- Approve sets status to `approved` + `cfo_processed_at` + payout details

### 6. Remove partner withdrawals from Financial Ops ApprovalQueue

Remove the `investment_withdrawal_requests` query from `ApprovalQueue.tsx` (the "withdrawals" tab) since partner withdrawals now flow through their own dedicated chain.

### 7. Update supporter-facing UI

In `InvestmentWithdrawButton.tsx`, add the step tracker showing the creative labels so funders can see their request progress through: Requested → Portfolio Review → Operations Clearance → Treasury Payout.

---

## Files to modify

- **Migration**: Add columns to `investment_withdrawal_requests`
- `src/components/wallet/WithdrawalStepTracker.tsx` — add partner variant
- `src/components/executive/PartnersOpsDashboard.tsx` — add withdrawal queue
- `src/components/coo/COOWithdrawalApprovals.tsx` — add partner withdrawal stage
- `src/components/cfo/CFOWithdrawalApprovals.tsx` — add partner payout processing
- `src/components/financial-ops/ApprovalQueue.tsx` — remove partner withdrawals
- `src/components/supporter/InvestmentWithdrawButton.tsx` — add step tracker