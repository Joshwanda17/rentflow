

## Plan: Multi-Stage Withdrawal Approval Flow with Step Tracker

### Current State
- `withdrawal_requests` table has statuses: `pending`, `approved`, `rejected`
- Manager currently approves/rejects directly, setting status to `approved` (which triggers wallet deduction + payout)
- Users see withdrawal status in `UserWithdrawalRequests` component (shown in wallet cards across all dashboards)
- No multi-stage approval exists — it's a single Manager approval

### What Changes

**1. Database Migration — Add approval stage columns to `withdrawal_requests`**

Add three new columns to track each approval gate:
- `manager_approved_at` (timestamptz, nullable)
- `manager_approved_by` (uuid, nullable)  
- `cfo_approved_at` (timestamptz, nullable)
- `cfo_approved_by` (uuid, nullable)
- `coo_approved_at` (timestamptz, nullable)
- `coo_approved_by` (uuid, nullable)

Update `status` to support new stages: `pending` → `manager_approved` → `cfo_approved` → `approved` (COO final)

**2. New Component — `WithdrawalStepTracker.tsx`**

A reusable stepper component showing 4 steps:
1. **Requested** — User submitted (always completed once submitted)
2. **Manager Review** — Pending/Completed with timestamp
3. **CFO Review** — Pending/Completed with timestamp  
4. **COO Approval & Payment** — Pending/Completed with timestamp

Each step shows: icon, label, status (waiting/in-progress/completed), and timestamp when completed. Uses a vertical stepper layout with connecting lines (mobile-friendly). Completed steps get a green checkmark and strikethrough line.

**3. Update `UserWithdrawalRequests.tsx`**

- Import and render `WithdrawalStepTracker` inside each withdrawal request card
- Pass the approval stage data to determine which steps are completed
- Show the tracker when a request is expanded/tapped

**4. Update `WithdrawRequestDialog.tsx` success screen**

- After submission, show the step tracker with Step 1 completed, indicating the request is now with the Manager

**5. Update `WithdrawFlow.tsx` (supporter payment flow) receipt screen**

- Same step tracker on the receipt/success screen

**6. Update Manager `WithdrawalRequestsManager.tsx`**

- Manager approval now sets `status = 'manager_approved'` instead of `'approved'`
- Sets `manager_approved_at` and `manager_approved_by`
- No wallet deduction yet — that happens at COO stage

**7. Update CFO Dashboard — Payouts tab**

- Add a "Withdrawal Approvals" section showing requests with `status = 'manager_approved'`
- CFO can approve → sets `status = 'cfo_approved'`, records `cfo_approved_at/by`

**8. Update COO Dashboard**

- Add a "Final Withdrawal Approvals" section showing `status = 'cfo_approved'`
- COO approves → sets `status = 'approved'`, records `coo_approved_at/by`, triggers wallet deduction and payment

**9. Excluded from changes**
- Admin/Manager/CFO/COO dashboards do NOT show the user-facing step tracker — they see their own approval queues instead

### Technical Notes
- The existing database trigger for wallet deduction on `approved` status continues to work — it only fires when status becomes `approved` (now only set by COO)
- RLS policies remain unchanged — the new columns are nullable and don't affect existing access patterns
- The step tracker component is pure UI reading existing row data — no new queries needed

