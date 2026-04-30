---
name: Anchored cache drift + reseed
description: CFO panel + RPC to reduce inflated cached withdrawable buckets on anchored wallets down to the strict ledger-true figure
type: feature
---
After the 2026-04-29 fresh-start anchor backfill, several agent wallets keep a cached `withdrawable_balance` that sits ABOVE the strict `get_user_available_balance` (e.g. LOLEM FIRICILA: cache 1,897,133 vs strict 313,500). The strict rule already prevents over-payment at withdrawal time, but the cache made operator-facing UIs (CFO Wallet Deduction list, agent split card) promise money the system would refuse.

**Diagnostics**: `wallet_anchored_drift_view` lists every user with a row in `wallet_fresh_start_anchors` whose `cached_withdrawable − get_user_available_balance(user) >= 1000`, exposing `over_cache_delta`. Surfaced in the CFO **Reconciliation** tab via `<AnchoredCacheDriftPanel />`.

**Reseed**: `reseed_anchored_withdrawable(p_user_id, p_reason)` (CFO/super_admin, reason ≥ 10 chars) posts a single `create_ledger_transaction` (wallet leg `system_balance_correction` cash_out + platform leg `phantom_writedown_clearing` cash_in) for the over-cache delta — driving the cached bucket down through the standard sole-writer path. The delta is also recorded into `wallet_historical_drift_review` (`status=reseed_posted`, `cfo_decision=reseed_to_strict`) so the historical-drift workflow tracks the explicit decision. Reseed is opt-in per user; nothing automatic.

**UI clamps**: the CFO Wallet Deduction "By Balance Range" list now clamps each row's `withdrawable_balance` to `get_user_available_balance` and shows an amber "Cache shows X — pending CFO reconciliation" sub-line when the cache is higher. (The "By Name" path already clamped via `overlayLedgerBalances`.) `useAgentBalances` already clamped via `computeLedgerAvailable`, so the agent dashboard is unaffected.
