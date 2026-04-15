

# ROI Payout Pipeline Redesign — Remove Financial Ops, Add COO Approval Stage

## Summary

Restructure the ROI payout flow so that when Partner Ops or COO initiates a partner payout from "Nearing Payouts," it first goes through a **COO approval stage** (new section on COO Dashboard), and only after COO approval does it appear on the **CFO Dashboard** as an ROI expense item ready for disbursement — mirroring how the Rent Disbursement Queue works.

## New Pipeline Flow

```text
Partner Ops / COO (Nearing Payouts)
  ↓  initiates payout → status: 'pending_coo_approval'
COO Dashboard → "ROI Return Approvals" (NEW section)
  ↓  COO approves → status: 'coo_approved'
CFO Dashboard → "ROI Payout Expense" queue (batch disbursement)
  ↓  CFO disburses → wallet credited, ledger entries written
```

Financial Ops is completely removed from this pipeline.

---

## Technical Plan

### Step 1 — Modify `handlePay` in COOPartnersPage (Nearing Payouts)

Currently inserts into `pending_wallet_operations` with `status: 'pending'`. Change to:
- Set `status` to `'pending_coo_approval'` (new status value)
- Remove CFO notification — instead notify COO users
- Keep audit log with action `roi_payout_initiated`

### Step 2 — Create `COOROIApprovals` component

New file: `src/components/coo/COOROIApprovals.tsx`

- Queries `pending_wallet_operations` where `category = 'roi_payout'` AND `status = 'pending_coo_approval'`
- Shows partner name, amount, portfolio reference, initiated date
- **Bulk approval**: checkbox selection + "Approve All Selected" button
- Individual approve/reject buttons
- On approve: updates `status` to `'coo_approved'`, sets `reviewed_by` and `reviewed_at`
- On reject: updates `status` to `'rejected'` with reason
- Notifies CFO users on approval
- Audit log entry: `coo_roi_approval`

### Step 3 — Add "ROI Return Approvals" to COO Dashboard

In `src/pages/COODashboard.tsx`:
- Add `<COOROIApprovals />` section below existing withdrawal approvals
- Include a pending count badge

### Step 4 — Update CFO `CFOROIRequests` component

Modify `src/components/cfo/CFOROIRequests.tsx`:
- Change the pending filter from `status = 'pending'` to `status = 'coo_approved'`
- This ensures only COO-approved items appear for CFO disbursement
- The existing approve flow (calling `approve-wallet-operation` edge function) handles the actual wallet credit and ledger entries
- Rename the section label to "ROI Payout — Expense" for clarity

### Step 5 — Add bulk approval support to COOROIApprovals

- Checkbox per row + "Select All" toggle
- Batch approve button that processes all selected items
- Batch reference input (like `RentDisbursementQueue` pattern)
- Treasury impact banner showing total selected amount

---

## Files Changed

| File | Action |
|------|--------|
| `src/components/coo/COOROIApprovals.tsx` | **Create** — New COO approval queue with bulk support |
| `src/pages/COODashboard.tsx` | **Edit** — Add ROI Approvals section + menu item |
| `src/components/coo/COOPartnersPage.tsx` | **Edit** — Change `handlePay` status to `pending_coo_approval`, notify COO instead of CFO |
| `src/components/cfo/CFOROIRequests.tsx` | **Edit** — Filter on `coo_approved` status instead of `pending` |

No database migration needed — `pending_wallet_operations.status` is a text column that already accepts arbitrary values.

