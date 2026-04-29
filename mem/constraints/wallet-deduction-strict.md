---
name: Wallet Deduction strict-withdrawable
description: CFO wallet-deduction tool MUST gate on get_user_available_balance and never spill into float. Float is company liability and is non-deductible from this tool.
type: constraint
---
The `wallet-deduction` edge function (Financial Ops → CFO Wallet Deduction panel) is strict-withdrawable-only:

1. **Cap the request** by `get_user_available_balance(target_user_id)` — the same strict RPC the UI uses. Never use the raw cached `wallets.withdrawable_balance + float_balance` as the cap. If `amount > strict_available`, reject with HTTP 400 and a "Maximum deductible: UGX X" message; do not invent fallbacks.
2. **No float-spill branch.** Do not emit any `agent_float_settlement`/float-bucket cash_out leg from this tool. If withdrawable cannot cover the request, the request is rejected — float is company liability per the 3-bucket rule.
3. **Defensive recheck** the live `wallets.withdrawable_balance` immediately before calling `create_ledger_transaction`; on a race, return HTTP 409 "Withdrawable balance changed" instead of letting the `wallets_balance_check` constraint fire.
4. **Tag** the wallet leg with `recipient_type: 'user'` so Wallet Routing v2 routes correctly to `withdrawable_balance`.
5. **Diagnostics**: on rejection, `console.error` `{user_id, requested, strict_available, cache_withdrawable, cache_float}`. When `cache_withdrawable > strict_available` (cache is inflated relative to strict), insert a `wallet_overdraw_events` row tagged `source: 'wallet-deduction'` so the CFO Reconcile tab surfaces the drift.

**Why:** Spilling into float drove `float_balance` (and therefore `wallets.balance`) negative, triggering `wallets_balance_check` constraint failures and silently violating the wallet 3-bucket model.
