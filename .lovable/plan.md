

# Two-Stage Wallet Withdrawal Chain: Financial Ops → CFO

## Summary

Wallet withdrawal requests currently go straight to the CFO. The new flow routes them through Financial Operations first for verification (with a mandatory reference), then to the CFO for final approval (no TID required). Partner withdrawals remain unchanged (Partner Ops → COO → CFO).

## New Flow

```text
User withdraws → pending
  → Financial Ops verifies (enters reference, logged) → fin_ops_verified
  → CFO approves (no TID needed, just approve) → approved → user notified
```

Either stage can reject.

## Changes

### 1. Database Migration
- Add `fin_ops_verified` to the `withdrawal_requests` status values (alter CHECK constraint or enum)
- Add columns: `fin_ops_reference` (text), `fin_ops_verified_by` (uuid), `fin_ops_verified_at` (timestamptz)
- RLS: ensure CFO and financial_ops roles can SELECT/UPDATE

### 2. Financial Ops — Add Wallet Withdrawals to Command Center
**File: `src/components/financial-ops/FinancialOpsCommandCenter.tsx`**
- The "Withdrawals & Payouts" view already shows `PendingWalletOperationsWidget` — add a new `FinOpsWithdrawalVerification` component alongside it

**New file: `src/components/financial-ops/FinOpsWithdrawalVerification.tsx`**
- Queries `withdrawal_requests` where `status = 'pending'`
- Shows user name, amount, MoMo details, age
- "Verify & Forward" button opens dialog requiring a **reference** (min 3 chars)
- On verify: updates `withdrawal_requests` → `status = 'fin_ops_verified'`, stores `fin_ops_reference`, `fin_ops_verified_by`, `fin_ops_verified_at`, inserts `audit_logs` entry
- Reject button with mandatory reason

### 3. CFO Dashboard — Change to Receive Verified Requests Only
**File: `src/components/cfo/CFOWithdrawalApprovals.tsx`**
- Change query filter from `.eq('status', 'pending')` to `.eq('status', 'fin_ops_verified')`
- Display the Fin Ops reference on each card (read-only, shows who verified and when)
- Remove the TID input requirement — change "Approve & Pay" to just "Approve"
- On approve: set `status = 'approved'`, `cfo_approved_at`, `cfo_approved_by`, `processed_at`, `processed_by` — no `transaction_id` required
- Insert `audit_logs` entry
- Send user notification: "Withdrawal successful"

### 4. Approval Queue Alignment
**File: `src/components/financial-ops/ApprovalQueue.tsx`**
- The existing `wallet_withdrawals` queue already handles withdrawals — ensure its approve action also sets `fin_ops_verified` (not `manager_approved`) with a reference, to align with the new chain

## Files Changed

| File | Action |
|------|--------|
| Migration SQL | Add `fin_ops_verified` status + 3 new columns |
| `src/components/financial-ops/FinOpsWithdrawalVerification.tsx` | **Create** — Fin Ops verification UI with reference input |
| `src/components/financial-ops/FinancialOpsCommandCenter.tsx` | Add `FinOpsWithdrawalVerification` to withdrawals view |
| `src/components/cfo/CFOWithdrawalApprovals.tsx` | Query `fin_ops_verified`, remove TID, show Fin Ops ref |
| `src/components/financial-ops/ApprovalQueue.tsx` | Align wallet withdrawal approve to set `fin_ops_verified` |

## Risks
- Existing `pending` withdrawals will need to go through Fin Ops first (no bypass) — this is intentional for accountability
- Bulk approve in ApprovalQueue will also require individual references (or be limited to the new verify action)

