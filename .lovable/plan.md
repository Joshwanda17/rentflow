## Goal

You want every reconciliation entry to land on the **wallet ledger** (the side that the user's strict balance is computed from), not on the platform ledger. The platform leg is just the balancing counter-leg.

## Current state (after audit)

`reseed_wallets_to_cached_balance` (migration `20260505094021`) already posts a balanced pair per user:

```text
case A: cached > strict_ledger  (need to credit ledger up)
  wallet leg:   cash_in  historical_balance_reseed       scope=wallet    user_id=<user>
  platform leg: cash_out platform_loss_writeoff          scope=platform  user_id=NULL

case B: cached < strict_ledger  (need to debit ledger down)
  wallet leg:   cash_out wallet_deduction_general_adjustment   scope=wallet    user_id=<user>
  platform leg: cash_in  system_balance_correction             scope=platform  user_id=NULL
```

So the **wallet-side leg already writes to `ledger_scope='wallet'`** with the user's id, classification `production`, and a category that is NOT excluded by the strict-net filter — meaning the user's strict ledger DOES move when the anchor runs.

The platform leg is correctly isolated to `ledger_scope='platform'` with `user_id=NULL`, so it never inflates or deflates a user's wallet ledger.

## What is still wrong / needs a tweak

Two small things to harden so this matches the rule "drift lives on the wallet ledger, fix lives on the wallet ledger":

1. **Strict-net filter consistency** — `get_user_available_balance` and `wallet_ledger_truth_view` exclude rows where `classification='admin_correction' OR category='system_balance_correction'`. Our anchor uses `classification='production'` and avoids `system_balance_correction` on the wallet leg, so the wallet leg is already counted. Add an explicit comment + a test query in the migration so future devs don't accidentally flip the wallet leg to `system_balance_correction` (which would silently make the anchor a no-op for strict balance).

2. **Idempotency / re-run safety** — currently a second click would post another pair on top. Add a uniqueness guard: skip users that already have a row in `wallet_negative_reconciliation_log` for today (Africa/Kampala day), so the operator can rerun the dry-run / execute pair without doubling up.

3. **Verification view** — add a small CFO read-only view `wallet_anchor_today_view` that shows, per user touched today: cached_balance, strict_ledger_net, delta, anchor_ledger_id. Surface a "Verify last anchor" button on `NegativeWalletReconciliationPanel` that lists the first 50 rows.

## Deliverable

- Migration: add today-key uniqueness guard inside `reseed_wallets_to_cached_balance`, plus inline comments documenting why the wallet leg category must stay outside the strict-net exclusion list.
- Migration: create `wallet_anchor_today_view` (security_invoker, CFO/super_admin filter via RLS-style WHERE on caller role).
- UI: extend `NegativeWalletReconciliationPanel` with a "Verify last anchor" expandable section that queries the view and shows a small table (user, cached, strict, delta).

No change to the wallet-cache write path — cached balances stay untouched, only the wallet ledger moves, exactly as you described.