## Goal

Stop phantom withdrawable balances **today** without retroactively gifting users money they already spent or withdrew before the ledger became the source of truth.

The all-time `general_ledger` net is unreliable for historical wallets — many old withdrawals/payouts were never journaled as `cash_out` rows. Forcing `wallet = ledger_net` would credit users with money they already received off-ledger.

The fix is a **baseline anchor**: from this moment forward, drift is measured as *change in wallet* vs *change in ledger* since the baseline — never against all-time history.

## What gets built

### 1. Baseline snapshot table

`wallet_ledger_baseline` — one row per wallet, captured once:

- `user_id`, `withdrawable_at_baseline`, `float_at_baseline`, `advance_at_baseline`
- `ledger_net_at_baseline` (all-time net at the moment of snapshot)
- `baseline_at` timestamp, `baseline_reason`

From here on, "true balance" = `baseline_wallet + (ledger_net_now − ledger_net_at_baseline)`.

### 2. One-time clamp pass (overstated wallets only)

For each wallet where `withdrawable + float − advance > max(0, ledger_net_all_time)` AND ledger_net is non-negative:

- Reduce `withdrawable_balance` down to `min(current_withdrawable, max(0, ledger_net))` via `apply_wallet_movement` with a `system_balance_correction` cash_out leg, paired with an `interest_expense`/`admin_correction` platform leg (balanced).
- Tag the correcting ledger row `classification = 'admin_correction'` and metadata `reason = 'phantom_clamp_2026_04_29'`.
- Never touch `float_balance` or `advance_balance` in this pass.
- Never clamp using a negative ledger net (those are accounting bugs, handled separately).

### 3. Freeze pass (understated wallets)

For wallets where ledger_net > current bucket sum: **do nothing automatic**. Insert a row into `wallet_ledger_review_queue` with the gap, current buckets, ledger_net, and recipient_type histogram of the user's ledger rows. CFO reviews case-by-case in a new dashboard tab.

### 4. Negative-ledger-net quarantine

Wallets whose all-time ledger net is negative (e.g. user b4d7c324 at −50M) indicate unbalanced legs / posting bugs, not real debts. Insert into `wallet_ledger_review_queue` with reason `negative_ledger_net` and **do not** alter the wallet.

### 5. Forward-looking "true available" helper

Update `get_user_available_balance` and `computeLedgerAvailable.ts` to use the **baseline-anchored** formula:

```
available = max(0, min(
  withdrawable_balance,
  baseline_withdrawable + (ledger_net_now − ledger_net_at_baseline)
) − pending_holds)
```

If no baseline row exists yet (new user), fall back to today's wallet cache (which is also the implicit baseline at first deposit).

### 6. CFO Reconcile dashboard additions

A new "Wallet Review Queue" panel showing:

- Phantom clamp results (amount removed per user, total)
- Understated cases awaiting decision (Approve credit / Mark as legitimate prior payout / Investigate)
- Negative-ledger-net cases

Approve actions post a properly-tagged `admin_correction` ledger transaction through `apply_wallet_movement`.

## Files & migrations

- **Migration**: create `wallet_ledger_baseline`, `wallet_ledger_review_queue` tables + RLS (CFO/COO/manager only).
- **Migration**: function `snapshot_wallet_ledger_baseline()` — populates baseline for all wallets in one go.
- **Migration**: function `run_phantom_clamp_pass(p_dry_run boolean)` — returns preview or executes; uses `apply_wallet_movement` only.
- **Migration**: rewrite `get_user_available_balance` to use baseline-anchored formula.
- **Edit**: `src/lib/computeLedgerAvailable.ts` to call the new RPC instead of computing inline.
- **New**: `src/components/admin/WalletReviewQueuePanel.tsx` mounted in CFO Reconcile tab.
- **New edge function**: `cfo-resolve-wallet-review` to action review-queue rows safely.

## Execution order (after approval)

1. Migration: tables + baseline snapshot function. Run it (snapshots all wallets at current state).
2. Migration: clamp function. Run dry-run first, show CFO the preview, then execute.
3. Populate review queue for understated + negative-net cases.
4. Update RPC + frontend helper to baseline-anchored math.
5. Ship CFO Reconcile UI panel.

## What this explicitly does NOT do

- Does not credit any wallet upward automatically.
- Does not touch the ledger history (no edits, only new `admin_correction` rows).
- Does not bypass `apply_wallet_movement` — every wallet mutation goes through the sole writer.
- Does not assume the all-time ledger is correct; it just freezes today as the new reference point.

## Memory updates after build

Add a new core memory: **WALLET BASELINE ANCHOR** — `wallet_ledger_baseline` is the start-of-truth for each wallet; "available" math is `baseline + Δledger_since_baseline`, never raw all-time ledger net.
