

# Direct Agent Wallet Credit for Proxy Payouts

## Problem
When COO/Partner Ops clicks "Credit Agent Wallet" from the Nearing Payouts section, the money goes into a `pending_wallet_operations` queue awaiting CFO approval. The agent never sees the money until CFO acts. The user wants the credit to land in the agent's wallet **immediately**.

## Current Flow
```text
COO clicks "Credit Agent Wallet"
  → pending_wallet_operations (status: pending)
    → CFO approves
      → general_ledger insert
        → sync_wallet_from_ledger trigger
          → agent wallet updated
```

## New Flow
```text
COO clicks "Credit Agent Wallet"
  → general_ledger insert (direct, cash_in to agent)
    → sync_wallet_from_ledger trigger fires
      → agent wallet balance increases immediately
  → audit_logs + notifications
  → next_roi_date advanced

Agent withdraws to pay partner → normal withdrawal pipeline applies
```

## Changes

### 1. `src/components/coo/COOPartnersPage.tsx` — `handlePay` function (mode `agent_wallet`)

When `mode === 'agent_wallet'`, instead of inserting into `pending_wallet_operations`, the function will:

- Insert directly into `general_ledger` with:
  - `user_id`: agent's ID (from `managedInfo`)
  - `direction`: `cash_in`
  - `category`: `roi_payout`
  - `transaction_group_id`: new UUID (required for `sync_wallet_from_ledger` trigger)
  - `ledger_scope`: `platform`
  - `linked_party`: partner's investor ID
  - `description`: `[Agent Wallet] ROI payout of X to agent_name on behalf of partner_name`
- Still advance `next_roi_date` on the portfolio
- Still insert audit log (`roi_managed_payout_direct`)
- Still notify the partner and CFO users (as informational, not approval-required)
- Mark as completed immediately (no "pending" state)

The `wallet` and `already_paid` modes remain unchanged — they still go through the pending pipeline.

### 2. Same fix in the Partner Detail payment options (lines ~2940-3004)

The same "Credit Agent Wallet" button exists in the partner detail view's payment options step. Apply the identical direct-credit logic there.

### No Edge Function or Database Changes Needed

The `general_ledger` insert with a `transaction_group_id` already triggers `sync_wallet_from_ledger` which updates the agent's wallet balance. This is the same mechanism used by other direct-credit flows in the system.

## Summary

| Change | File |
|--------|------|
| Direct ledger credit for `agent_wallet` mode | `COOPartnersPage.tsx` (2 locations: NearingPayoutsDialog + partner detail) |

One file change, two locations within it. The agent sees money immediately; the existing withdrawal pipeline governs how the agent sends it to the partner.

