

# Restructure Wallet Withdrawal Flow: 4-Stage Pipeline

## New Flow
```text
User Request (pending)
  → Financial Ops Approves (fin_ops_approved)
    → CFO Approves (cfo_approved)
      → Financial Ops enters TID & completes (approved)
```

## Current Flow (broken)
Financial Ops currently does TID verification AND approval in one step (`pending` → `fin_ops_verified`), then CFO does final approval (`fin_ops_verified` → `approved`). The user wants Financial Ops to approve first without a TID, CFO to approve second, then Financial Ops to enter the TID and mark complete.

## Changes

### 1. `src/components/financial-ops/FinOpsWithdrawalVerification.tsx` — Split into two sections

**Section A — "Pending Approvals"**: Fetches `status = 'pending'`. Approve button sets status to `fin_ops_approved` (no TID required). Reject still works as-is.

**Section B — "Awaiting TID Completion"**: Fetches `status = 'cfo_approved'`. Shows requests that the CFO has approved. "Complete" button requires a TID, sets status to `approved`, records `fin_ops_reference`, `fin_ops_verified_by`, `fin_ops_verified_at`, and `processed_at`.

### 2. `src/components/cfo/CFOWithdrawalApprovals.tsx` — Change filter

Change the query filter from `fin_ops_verified` to `fin_ops_approved`. CFO approval sets status to `cfo_approved` (instead of `approved`). Remove `processed_at`/`processed_by` — final processing happens at TID stage.

### 3. `src/components/wallet/WithdrawalStepTracker.tsx` — Update wallet steps

Replace the 4-step wallet chain with:
1. **Requested** — Withdrawal submitted (`createdAt`)
2. **Financial Review** — Fin Ops approval (`finOpsApprovedAt`)
3. **CFO Approval** — CFO sign-off (`cfoApprovedAt`)
4. **Payment Verified** — TID entered & completed (`finOpsVerifiedAt` or `processedAt`)

Add `finOpsApprovedAt` and `finOpsVerifiedAt` props.

### 4. `src/components/wallet/UserWithdrawalRequests.tsx` — Add new status labels

Add `fin_ops_approved` status config (label: "Fin Ops Approved", blue). Update `cfo_approved` label. Update the step tracker props to pass the new timestamps. Add `fin_ops_approved` to the pending count filter.

### 5. Database migration — Add `fin_ops_approved_at` column

Add `fin_ops_approved_at TIMESTAMPTZ` and `fin_ops_approved_by UUID` columns to `withdrawal_requests` to track the first Financial Ops approval separately from the final TID verification.

## Files Modified
- `supabase/migration` — add `fin_ops_approved_at`, `fin_ops_approved_by` columns
- `src/components/financial-ops/FinOpsWithdrawalVerification.tsx` — split into approve + TID complete
- `src/components/cfo/CFOWithdrawalApprovals.tsx` — filter `fin_ops_approved`, set `cfo_approved`
- `src/components/wallet/WithdrawalStepTracker.tsx` — new 4-step wallet chain
- `src/components/wallet/UserWithdrawalRequests.tsx` — new status labels + tracker props

