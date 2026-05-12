## Why one-line patches keep failing

40+ edge functions call `create_ledger_transaction`; only 5 pass `recipient_type`. Every other caller is one omission away from re-creating Muwanguzi Fred's bug. The defect is structural and must be fixed at the database boundary, not per-caller.

Constraints from the user: **no reseed**, **no new tables**.

## Permanent solution — DB-only, reuses existing tables

### 1. Hardcode the category → recipient_type mapping inside `create_ledger_transaction`

Add a `CASE` block that derives `recipient_type` for every `ledger_scope='wallet'` entry whose direction is `cash_in`/`cash_out`. The allowlist already exists (32 production categories). Map them in-function:

```text
operational_wallet (float bucket):
  agent_float_deposit, agent_float_settlement, agent_float_used_for_rent,
  partner_float_topup, …

user (withdrawable bucket):
  wallet_deposit, agent_commission_earned, partner_commission,
  roi_wallet_credit, landlord_rent_disbursement, payroll_credit,
  wallet_transfer_in/out, business_advance_disbursement, …
```

Resolution rules inside the function:
1. If caller passed `recipient_type` → validate it matches the CASE default. On mismatch, log to existing `wallet_routing_violations` and use the CASE default (table-of-truth wins, never the caller).
2. If caller omitted `recipient_type` → fill it from the CASE default automatically.
3. If category is unknown to the CASE block → `RAISE EXCEPTION 'ROUTING_REQUIRED for category %'`. No silent path.
4. Always set `recipient_id := entry.user_id` for wallet-scope legs.

This single migration converts the 35+ unpatched callers from "silently broken" to "correct by construction" without touching any edge function code.

### 2. Make `apply_wallet_movement` loud

- Remove the silent early-return when `route='none'`. Replace with `RAISE EXCEPTION`.
- Existing `wallet_unrouted_movements` table stays as the audit trail; in production it should now stay empty.
- This guarantees that if step 1 ever has a gap, the transaction fails fast instead of silently freezing a wallet cache.

### 3. Backstop trigger on `general_ledger`

Add `trg_enforce_wallet_leg_routing` (BEFORE INSERT) that re-checks: every `ledger_scope='wallet'` row must have `recipient_type IN ('user','operational_wallet')` and `recipient_id = user_id`. Even if a future migration bypasses `create_ledger_transaction`, the wallet bucket cannot be left un-routed. Same defense-in-depth pattern as `trg_enforce_production_april_cutoff` and `enforce_wallet_ledger_only` — no new table, just a trigger.

### 4. Observability — reuse what exists

- Surface `wallet_routing_violations` count (last 24h) inside the existing CFO `PhantomDriftPanel` as a new row. No new table, no new view file required — direct count query.
- Existing `wallet_unrouted_movements` already has the RLS + UI hook from the sole-writer rule.

### 5. Edge-function cleanup (optional, no urgency)

After steps 1–3 ship, edge functions are correct by construction. Updating them to pass `recipient_type` explicitly becomes documentation, not a bugfix, and can happen one PR at a time. `approve-deposit` will be patched in the same PR as the migration purely for clarity.

## Forward-only stance (per "DO NOT RESEED")

- Muwanguzi Fred's historical ledger entries remain the source of truth and continue to surface in `v_user_wallet_strict` / `get_user_wallet_view` / the PDF.
- Every deposit / commission / withdrawal posted **after** the migration moves his cached buckets correctly via the sole-writer path.
- No retroactive cache adjustment, no reseed call, no ledger rewrite.

## Migration order (single PR)

1. Migration: rewrite `create_ledger_transaction` body with the CASE mapping + violation logging using existing `wallet_routing_violations`.
2. Migration: rewrite `apply_wallet_movement` to RAISE on unrouted instead of return.
3. Migration: add `trg_enforce_wallet_leg_routing` BEFORE INSERT trigger on `general_ledger`.
4. Edge fn: `approve-deposit` adds explicit `recipient_type` for clarity (not for correctness — DB now enforces it).
5. Smoke test: dry-run a float deposit + a wallet deposit + a commission credit → confirm `wallets.float_balance` and `withdrawable_balance` move and `wallet_routing_violations` stays empty.

## Out of scope

- No new tables.
- No `reseed_anchored_*` calls.
- No retroactive ledger rewrites.
- No UI redesign (only a single counter added to the existing CFO panel).
