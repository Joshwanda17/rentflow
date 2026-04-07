

# Unified Financial Control System: CFO Approval Gate for ROI & Payouts

## Problem
Currently, the "Credit Agent Wallet" mode bypasses CFO approval and credits the agent directly. The user wants **all** fund allocations to go through CFO approval first. The separation of powers is:
- **CFO** controls money **into** wallets (approve credits)
- **Financial Ops** controls money **out of** wallets (approve withdrawals)

## Current vs. Required Flow

```text
CURRENT (agent_wallet mode):
  Partner Ops clicks "Credit Agent Wallet"
    → direct general_ledger insert → agent wallet credited immediately

REQUIRED:
  Partner Ops clicks any payout option
    → pending_wallet_operations (status: pending)
      → CFO approves → ledger insert → wallet credited
        → Partner/Agent withdraws → Financial Ops approves → money out
```

## Changes

### 1. Revert Direct Credit in `COOPartnersPage.tsx`

In the `handlePay` function, remove the special `agent_wallet` direct-credit branch (lines ~2633-2687). All three modes (`wallet`, `agent_wallet`, `already_paid`) will go through `pending_wallet_operations` with status `pending`. The `agent_wallet` mode will set `target_wallet_user_id` to the agent's ID so the CFO and approve-wallet-operation function know which wallet to credit.

### 2. New CFO Tab: "ROI Requests"

Create `src/components/cfo/CFOROIRequests.tsx` — a dedicated panel showing all `pending_wallet_operations` where `category = 'roi_payout'`.

Displays:
- Partner name, agent name (if proxy), amount, requested by, timestamp
- Status badge (pending / approved / rejected)
- Approve and Reject buttons with mandatory 10-char reason for rejection

On **Approve**: calls the existing `approve-wallet-operation` edge function which inserts into `general_ledger` and triggers `sync_wallet_from_ledger` to credit the wallet.

On **Reject**: updates `pending_wallet_operations` status to `rejected` with reason, notifies Partner Ops.

### 3. Add Tab to CFO Dashboard

In `CFODashboard.tsx`, add a new `roi` tab between Overview and Cash Position:
```
{ id: 'roi', label: 'ROI Requests', icon: TrendingUp }
```
Renders `<CFOROIRequests />` with pending count badge.

### 4. Update `approve-wallet-operation` Edge Function

The existing function already handles approval of `pending_wallet_operations` → ledger insert. It needs one small addition: when `target_wallet_user_id` is set (agent wallet proxy), use that as the `user_id` for the ledger credit instead of `user_id`. This ensures proxy agent wallets get credited correctly upon CFO approval.

### 5. Notifications

- **On initiation**: CFO gets `approval_required` notification for all ROI/payout requests (already exists for `wallet` mode, now extended to `agent_wallet`)
- **On CFO approval**: Partner gets `payout_completed` notification; agent gets notification if proxy
- **On CFO rejection**: Partner Ops gets `payout_rejected` notification with reason

## What Stays the Same

- Withdrawal pipeline (Financial Ops approval for cash-out) — already works
- `already_paid` mode logic — stays in pending pipeline
- Advance recovery on deposit — already works
- Audit logging — already in place
- `next_roi_date` advancement — stays at initiation time to prevent duplicate claims

## Summary

| Change | File |
|--------|------|
| Revert direct credit, route all modes through pending pipeline | `COOPartnersPage.tsx` |
| New ROI Requests approval panel | `CFOROIRequests.tsx` (new) |
| Add ROI tab to CFO dashboard | `CFODashboard.tsx` |
| Handle `target_wallet_user_id` for proxy credits | `approve-wallet-operation/index.ts` |

