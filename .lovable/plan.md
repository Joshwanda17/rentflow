## What's wrong

Joshua's 100,000 UGX float deposit (id `e0565229…`) **is approved and correctly posted** to the ledger:

- `general_ledger`: `agent_float_deposit`, `cash_in 100,000`, `wallet` scope, `production` ✅
- `wallets.float_balance = 100,000` ✅

But the dashboard reads `get_user_wallet_view` → `v_user_wallet_strict`, which returns **`float_balance: 0`**. That's why the card shows "Float USh 0".

### Root cause

`v_user_wallet_strict` computes float_raw by summing every wallet-scope row in the float category set across all of history:

| category | direction | amount |
|---|---|---|
| agent_float_deposit | cash_in | +100,000 |
| agent_float_assignment | cash_in | +5,000 |
| agent_float_used_for_rent | cash_out | −100,000 |
| agent_float_settlement | cash_out | −405,100 |

Net = **−400,100**. The view then does `GREATEST(0, float_raw) = 0` — wiping out today's real deposit because of legacy float-out entries that were never matched by float-in entries (the historical float was funded via `wallets.float_balance` writes that bypassed the ledger, before the ledger-as-truth rule was enforced).

This is the *same family* of issue we already solved for `withdrawable` via `wallet_fresh_start_anchors`, but the anchor only narrows withdrawable's window — float still scans all of history.

## Plan

### 1. Apply the fresh-start anchor to the float bucket too

Update `v_user_wallet_strict` so the `ledger` CTE's date filter (`a.anchor_at IS NULL OR gl.created_at >= a.anchor_at`) also governs the float and advance bucket sums (it already governs all rows fed into `buckets`, but I'll verify the path and ensure float honors the anchor consistently). Then create a `wallet_fresh_start_anchors` row for Joshua so his float window starts today.

### 2. Add a defensive float fallback

When `b.float_raw` is non-positive but `wallets.float_balance > 0` AND there is at least one post-anchor `cash_in` float row, fall back to `LEAST(wallets.float_balance, sum of post-anchor float cash_in − post-anchor float cash_out clamped at 0)`. This keeps the "ledger never inflates" invariant (a phantom cached float can't show up without a ledger justification) while preventing legacy negative drag from hiding fresh, ledger-justified float.

### 3. Backfill anchor for affected agents

One-time script: for every agent where `v_user_wallet_strict.float_balance = 0` but `wallets.float_balance > 0` AND there's a recent `agent_float_deposit` cash_in row, insert a `wallet_fresh_start_anchors` row anchored at the deposit's `created_at` (only if no anchor exists). Joshua is the immediate beneficiary; this also catches any other agent in the same trap.

### 4. Surface the historical drag for CFO review

Insert a row into `wallet_historical_drift_review` (already used by the withdrawable anchor backfill) for each anchored float, recording the pre-anchor negative float net so CFO can decide whether to write it off or chase recovery.

### 5. Verify

After migration:
- `SELECT * FROM v_user_wallet_strict WHERE user_id='cb798acb…'` should return `float_balance = 100000`.
- Agent dashboard hero card should show **Float USh 100,000**, **Withdrawable USh 50,000**, **Total UGX 150,000**.
- Realtime hook (`useWalletRealtime`) is already wired so the UI will reflect the change without a hard reload.

## Files / surfaces touched

- New migration: update `v_user_wallet_strict` (float fallback + advance fallback symmetric to withdrawable), backfill anchors for stuck agents, log to `wallet_historical_drift_review`.
- No frontend code changes needed — `useAgentBalances` already reads `get_user_wallet_view`, which will return the corrected float once the view is fixed.

## Memory updates

- Extend `mem://architecture/wallet-baseline-anchor` to record that the fresh-start anchor now also governs the **float** and **advance** buckets (not just withdrawable), with the same "never inflate beyond post-anchor ledger justification" invariant.

## Out of scope

- No changes to `apply_wallet_movement`, deposit-approval flow, or ledger writers — they are already correct. The bug is purely in the read-side strict view's handling of legacy negative bucket drag.
