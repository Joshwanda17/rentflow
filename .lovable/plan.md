## Goal

Zero out Atuhaire Carolyne's (`ae194750-4827-47e8-839e-5e772565138b`) displayed agent wallet balance — currently UGX 20,649,484 — by posting a balanced, audit-trailed ledger correction. No system-wide rules change. All 40M+ other users unaffected.

## Why this is the right fix

- Cached `wallets.withdrawable_balance` = 69,594,484 (already known phantom).
- Production-only ledger net = 20,649,484 — that is what `get_user_available_balance` correctly returns per the WITHDRAWABLE STRICT RULE.
- The strict RPC is doing exactly what it was designed to do; the problem is **historical phantom credits inside her production ledger** (legacy ROI/transfer rows that do not represent real agent earnings).
- Fix: one targeted reconciling ledger transaction. Wallets are recomputed by `apply_wallet_movement` triggered by the ledger insert, so the hero card will refresh to UGX 0 automatically.

## What gets posted

A single double-entry ledger transaction via `create_ledger_transaction`:

```text
Wallet leg   : user_id=ae19…  scope=wallet     direction=cash_out  category=system_balance_correction  amount=20,649,484
Platform leg : user_id=NULL   scope=platform   direction=cash_in   category=system_balance_correction  amount=20,649,484
classification: 'admin_correction'
recipient_type: 'user'
description   : "CFO reconciliation — zero phantom withdrawable for ATUHAIRE CAROLYNE per directive 2026-04-29"
```

This is identical in shape to the established `system_balance_correction` pattern already in use (e.g. payroll-growth ledger postings).

## Audit + observability

- `audit_logs` row: `action_type=wallet_reconciliation`, `table_name=wallets`, `record_id=<wallet id>`, `reason="CFO_zero_phantom_2026-04-29"` (10+ chars per audit governance rule).
- `system_events` row: `event_type=wallet.reconciled`, payload includes before/after withdrawable, ledger net, and operator id.
- After insert, verify with: `SELECT public.get_user_available_balance('ae194750-4827-47e8-839e-5e772565138b');` — must return 0.

## Implementation steps

1. **Migration (data-only)**: SQL block that calls `create_ledger_transaction(...)` with the entries above, then writes the `audit_logs` and `system_events` rows. Wrapped in a transaction; idempotency guard checks for an existing audit row with the same reason so re-running the migration is a no-op.
2. **No frontend changes** — `useAgentBalances` already reads `get_user_available_balance` via `computeLedgerAvailable`, so the hero card will display UGX 0 on next refetch (≤30s, or instant on realtime invalidation).
3. **Verify** in DB after migration runs: cached `withdrawable_balance` should drop to 0 (via `apply_wallet_movement` trigger), strict RPC returns 0, and `wallet_strict_drift_view` shows no residual drift for this user.

## Out of scope

- Not touching the `get_user_available_balance` RPC.
- Not changing `useAgentBalances`, hero card, or WithdrawFlow.
- Not auditing other agents in this pass (can be a follow-up using `wallet_strict_drift_view`).

## Risk

Low. The correction is one balanced ledger entry under `admin_correction` classification, which is the documented partition for exactly this case. Reversible by posting the inverse entry if needed.
