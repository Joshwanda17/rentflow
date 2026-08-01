---
name: Orphan wallet ledger legs (open investigation)
description: 9 wallet-scope general_ledger legs with user_id NULL and wallet_bucket NULL, UGX 544,780,988 gross - tracked work item, explicitly excluded from the 2026-08-01 pivot rebuild
type: feature
---
**Open, separately tracked work item (raised 2026-08-01).** Not part of the pivot rebuild and must not be silently patched.

- 9 rows in `general_ledger` with `ledger_scope='wallet'`, `user_id IS NULL`, `wallet_bucket IS NULL`; gross UGX 544,780,988.
- They route to nothing in `v_user_wallet_strict`, so no wallet balance is affected today — but they are an accounting anomaly.
- Required work per leg: originating transaction, `transaction_group_id`, source RPC / edge function, creation timestamp, intended counterparty.
- Outcome: if legitimate platform-side legs, document them. If incomplete transaction groups, fix through the normal balanced ledger correction process (`create_ledger_transaction`) — never by direct UPDATE.
