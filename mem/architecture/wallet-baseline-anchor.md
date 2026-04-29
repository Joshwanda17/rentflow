---
name: Wallet Baseline Anchor
description: wallet_ledger_baseline freezes today as the reference point for available-balance math, preventing all-time ledger drift from retroactively crediting users
type: feature
---
**Problem:** All-time `general_ledger` net is unreliable for historical wallets — many old withdrawals were never journaled. Forcing `wallet = ledger_net` would gift users money they already received off-ledger.

**Fix:** `wallet_ledger_baseline` (one row per user) freezes the wallet's 3 buckets and the all-time ledger net at the moment of capture. From that point forward:

```
allowed_cap = max(0, baseline_withdrawable + (ledger_net_now − ledger_net_at_baseline))
available   = max(0, min(withdrawable_cached, allowed_cap) − pending_holds)
```

This is the body of `get_user_available_balance(p_user_id uuid)` (param renamed from `_user_id`).

**Companion artifacts:**
- `wallet_ledger_review_queue` — informational queue for understated wallets (`reason='understated'`) and unbalanced-leg cases (`reason='negative_ledger_net'`). Never auto-credits.
- `snapshot_wallet_ledger_baseline()` — idempotent populate (ON CONFLICT DO NOTHING).
- `run_phantom_clamp_pass(p_dry_run boolean)` — for wallets where withdrawable bucket exceeds ledger net AND ledger_net ≥ 0, clamps via `apply_wallet_movement(uid, 'system_balance_correction', amount, 'cash_out')`. Skips negative-ledger-net cases (those are accounting bugs, queued for CFO review).
- Frontend: `src/lib/computeLedgerAvailable.ts` calls the RPC as the source of truth and falls back to `min(cache, ledger_net) − holds` only if the RPC is unavailable.

**Initial run (2026-04-29):** baseline snapshotted for all wallets; review queue populated with 71 cases.

**Rule going forward:** Any new "spendable" math MUST anchor to the baseline + delta-since-baseline, never raw all-time `general_ledger` SUM.
