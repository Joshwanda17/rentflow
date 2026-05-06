---
name: Pivot usage policy
description: ledger_balance_pivot is a verification + reconciliation layer only. Wallet reads use wallets cache; outgoing flows (withdraw/deduct/transfer-out) MUST call validate_wallet_against_pivot and reject on BALANCE_MISMATCH; incoming flows (deposit/topup/commission) MUST NOT pivot-check; UI MUST NEVER read pivot or ledger directly.
type: constraint
---
**Rule.** `ledger_balance_pivot` exists only for (a) real-time validation on debit paths and (b) background reconciliation. It is never a primary data source.

**Allowed reads.**
- User-facing wallet UI → `wallets` cache via `get_user_wallet_view` / `useAvailableBalance`. Never pivot, never ledger.
- Operator dashboards (CFO/FinOps) → may read `wallets`, `ledger_balance_pivot`, `wallet_pivot_drift_view` for reconciliation.

**Outgoing money flows MUST gate on pivot.** Edge functions: `approve-withdrawal`, `agent-withdrawal`, `wallet-deduction` (and any future debit-from-user path) MUST call `validate_wallet_against_pivot(user_id)` before posting the debit ledger entry. On `{ok:false,error:'BALANCE_MISMATCH'}` return HTTP 409 with that body. Threshold (default 1,000 UGX) is enforced inside the RPC.

**Incoming money flows MUST NOT pivot-check.** Deposits, top-ups, commissions, ROI credits, bonuses, transfers-in: just post the ledger entry and let the apply_wallet_movement + pivot triggers update both caches. Validating here would block legitimate credits during transient drift.

**Reconciliation (cron).** Compares pivot vs wallet; auto-repairs wallet when |drift| < threshold; logs to `phantom_wallet_drift` when ≥ threshold.

**Why.** Wallet = speed. Pivot = verification. Ledger = truth. Never query ledger per user request, never display pivot to end users, never let an outgoing payment ride on a drifted cache.
