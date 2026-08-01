---
name: Orphan wallet ledger legs (open investigation)
description: 9 wallet-scope general_ledger legs with user_id NULL and wallet_bucket NULL, UGX 544,780,988 gross - tracked work item, explicitly excluded from the 2026-08-01 pivot rebuild
type: feature
---
**Investigation complete 2026-08-01; remediation still pending CFO sign-off.** Full trace: `docs/investigations/orphan-wallet-ledger-legs.md`.

- 9 rows in `general_ledger` with `ledger_scope='wallet'`, `user_id IS NULL`, `wallet_bucket IS NULL`; gross UGX 544,780,988.
- They route to nothing in `v_user_wallet_strict`, so no wallet balance is affected today — but they are an accounting anomaly.
- **Two root causes.** (a) 8 legs (UGX 575,200; 2026-07-22 → 2026-07-26) are the company side of manual clawbacks/TID float recoveries — balanced against a real user leg but mis-tagged `ledger_scope='wallet'` instead of `'platform'`. (b) 1 leg `5c3a9455` (UGX 544,205,788, 2026-05-07 05:53) is a single **unbalanced aggregate** leg from the "negative balance wipe (pass 3, incl NULL bucket)" run as raw migration SQL (`source_table='manual_admin_action'`, no `system_events` / `audit_logs` entry).
- **Reporting impact:** any sum of `general_ledger` by `ledger_scope='wallet'` that does not group by user is inflated by up to UGX 544.78M. Platform-scope reporting is unaffected.
- Fix only through balanced ledger corrections (`create_ledger_transaction`) — never direct UPDATE. Leg (b) requires CFO sign-off on write-off vs full reversal, after reconstructing the pre-wipe negatives from the 2026-05-07 batch (109 legs, 3 passes).
- Proposed guardrail (not implemented): reject `ledger_scope='wallet'` inserts with NULL `user_id`.
