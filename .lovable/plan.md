## What you're seeing

On Joshua Wanda's row in the CFO Wallet Deduction list:

- **Withdrawable: USh 0** (strict)
- **Float (owed): USh 100,000** (correct, real)
- Amber warning: **"Cache shows USh 50,000 — pending CFO reconciliation"**

The warning is correct — there really is a 50,000 mismatch — but in this case the 50,000 is a **real, approved deposit**, not a phantom. The system is just refusing to count it because of where today's fresh-start anchor was placed.

## Root cause

Today (2026-05-01) Joshua had two real, approved deposits:

| Time     | Type                 | Amount   | Bucket it should hit |
|----------|----------------------|----------|----------------------|
| 11:54:38 | `wallet_deposit`     | 50,000   | Withdrawable         |
| 12:04:32 | `agent_float_deposit`| 100,000  | Float                |

To fix the earlier "Float showing 0" issue, we placed a fresh-start anchor at **12:04:31** (1 second before the float deposit). That successfully made the 100,000 float visible — but it also pushed the **11:54 wallet deposit into the pre-anchor window**, so the strict withdrawable view stops counting it. Meanwhile `apply_wallet_movement` already credited `wallets.withdrawable_balance = 50,000` when the deposit posted.

Result: cache (50K) > strict (0). The CFO panel correctly flags the gap, but the "right" answer is that the 50K is real and the strict view should include it — not that the cache should be wiped.

## Fix

1. **Re-anchor Joshua earlier.** Move his `wallet_fresh_start_anchors.anchor_at` from `2026-05-01 12:04:31` to `2026-05-01 11:54:37` (1 second before the wallet_deposit). This includes both today's legitimate deposits (50K withdrawable + 100K float) while still excluding all the pre-May-1 negative drag.
2. **Recompute `pre_anchor_ledger_net`** off the new anchor time and update the existing `wallet_historical_drift_review` row so CFO reporting stays accurate.
3. **Update anchor reason note** to explain the adjustment ("anchor moved earlier on 2026-05-01 to include same-day approved wallet_deposit that was orphaned by the prior float-only anchor").
4. **Verify**: after the migration, `get_user_available_balance(joshua) = 50,000`, `v_user_wallet_strict.float = 100,000`, and the amber drift warning disappears (cache 50K == strict 50K).

This is a one-user data correction — no schema change, no logic change, no impact on any other agent.

## Why not just clear the cache?

Clearing `wallets.withdrawable_balance` to 0 would erase a real approved 50,000 deposit that the user is owed. The cache is right; the anchor is what needs adjusting.

## Technical detail

```sql
-- Single-user data correction (run via supabase--insert / migration)
UPDATE public.wallet_fresh_start_anchors
SET anchor_at = '2026-05-01 11:54:37+00',
    pre_anchor_ledger_net = (
      SELECT COALESCE(SUM(CASE WHEN direction='cash_in' THEN amount ELSE -amount END), 0)
      FROM public.general_ledger
      WHERE user_id = 'cb798acb-68bc-4b4e-a414-a3d374e030b6'
        AND ledger_scope = 'wallet'
        AND classification = 'production'
        AND created_at < '2026-05-01 11:54:37+00'
    ),
    notes = notes || E'\n2026-05-01: Anchor moved 10 min earlier to include the same-day approved 50,000 UGX wallet_deposit that was orphaned by the float-only anchor placement.'
WHERE user_id = 'cb798acb-68bc-4b4e-a414-a3d374e030b6';

-- Refresh the historical drift review row to match
UPDATE public.wallet_historical_drift_review
SET pre_anchor_ledger_net = (... same subquery ...)
WHERE user_id = 'cb798acb-68bc-4b4e-a414-a3d374e030b6'
  AND status = 'pending_review';
```

Then `SELECT public.get_user_available_balance('cb798acb-...')` should return **50000**, and `wallet_anchored_drift_view` should no longer list Joshua.

## Out of scope

- The float bucket logic and anchor extension shipped earlier today stay as-is.
- The CFO Wallet Deduction strict-withdrawable rule stays as-is (float remains non-deductible).
- No changes to other 33 anchored agents.