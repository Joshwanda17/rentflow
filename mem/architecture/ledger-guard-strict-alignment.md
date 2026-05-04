---
name: Ledger guard solvency must match strict-withdrawable
description: The inner solvency check inside create_ledger_transaction MUST mirror get_user_available_balance — it cannot exclude system_balance_correction or admin_correction, otherwise legitimate CFO direct credits and corrections become "phantom" funds that show in the wallet, pass the strict gate, but get refused at posting time.
type: constraint
---
**Rule.** The `cash_out` solvency guard inside `public.create_ledger_transaction` filters general_ledger ONLY by `user_id`, `ledger_scope='wallet'` and `classification IS NULL OR classification='production'`. It MUST NOT add `category <> 'system_balance_correction'` or `classification <> 'admin_correction'` filters.

**Why.** Per the user-facing-ledger-filter rule, those exclusions apply to *display* surfaces only. Balance computations (strict gate, wallet-truth view, withdrawable cap) all count corrections as real backing. If the inner guard disagrees, the system enters a state where:
- Wallet shows the credit (cache + strict gate agree).
- The user initiates a withdrawal — passes the manager-side strict balance check.
- `create_ledger_transaction` then refuses the debit with `Insufficient ledger balance ... Available: -X` because it phantom-shrinks the user's balance.

**Fixed 2026-05-04** in migration aligning the guard with `get_user_available_balance`. Symptom that triggered the fix: a 75,000 UGX wallet credit posted as `system_balance_correction` blocked withdrawal even though the wallet card and strict gate both showed 75,000 available.
