---
name: Wallet Withdrawable Strict Rule
description: Withdrawable is strict ledger-backed — get_user_available_balance returns min(cached withdrawable, max(0, wallet ledger net)) - pending holds; cached wallet buckets, commission balance, and baseline snapshots can NEVER inflate withdrawable
type: feature
---
**Rule (2026-04-29 v2):** A user can only see and withdraw funds that are currently backed by their wallet ledger position. Cached values (`wallets.withdrawable_balance`, commission ledger sums, baseline snapshots) can REDUCE the displayed figure but can NEVER inflate it.

**Formula** (body of `public.get_user_available_balance(p_user_id uuid)`):

```
available = max(
  0,
  min(wallets.withdrawable_balance, max(0, wallet_ledger_net))
  - pending_withdrawal_holds
)
```

- `wallet_ledger_net` = sum over `general_ledger` where `ledger_scope='wallet'` and `classification` IS NULL or `'production'`, with `cash_in` positive and `cash_out` negative.
- Negative ledger net ⇒ withdrawable is 0 (accounting bug, surfaced in `wallet_ledger_review_queue`).
- No ledger backing ⇒ withdrawable is 0.
- Pending withdrawals (`pending|requested|manager_approved|processing`) reduce the figure.

**One source of truth:** UI (`src/hooks/useAgentBalances.ts`, `src/components/wallet/UnifiedWalletHeroCard.tsx`, `src/components/wallet/FullScreenWalletSheet.tsx`, `src/components/payments/WithdrawFlow.tsx`) and the approval gate (`supabase/functions/approve-withdrawal/index.ts`) all read this RPC. Never compute "spendable" inline.

**Forbidden display sources for "withdrawable":**
- raw `wallets.withdrawable_balance`
- raw `wallets.balance`
- `commissionBalance` (an earnings/history metric, not money currently in the wallet)
- `baseline_withdrawable + delta` (kept ONLY for audit, not for spending math)

**Companion artifacts (audit / cleanup only — do NOT use for spending decisions):**
- `wallet_ledger_baseline` — frozen 2026-04-29 snapshot. Audit reference only.
- `wallet_ledger_review_queue` — quarantined drift cases (CFO review).
- `snapshot_wallet_ledger_baseline()` — idempotent snapshot helper.
- `run_phantom_clamp_pass(p_dry_run boolean)` — clamps cached withdrawable down to ledger net via `apply_wallet_movement(uid,'system_balance_correction',amount,'cash_out')`.
- `public.wallet_strict_drift_view` — finance diagnostic of accounts where cached wallet exceeds strict ledger-backed withdrawable.

**Why the baseline approach was retired:** The baseline was meant to prevent retroactively crediting users for missing historical legs, but it had the side effect of letting old cached `withdrawable_balance` values remain spendable when the actual ledger said zero or negative. That contradicts the constitutional rule that the ledger is the source of truth. The strict rule clamps spendable to the ledger directly while still preventing over-credit (it never grows above the cache).
