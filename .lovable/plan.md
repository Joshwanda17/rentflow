# Fix Float / Commission Mis-Bucketing — Permanent Migration

## Problem

When agent **Onesmus** paid UGX 152,000 for tenant **Ignitius** (ledger group `9b17ad8d…`), all 4 ledger legs posted correctly, but his wallet showed:

- float = 650,000 (should be 498,000)
- withdrawable = 0 (should be 15,200 commission)

Root cause: `wallets` is now a **view** built on `v_user_wallet_strict`. That view assigns each ledger row to a bucket using a **hardcoded category list** that does not include the newer `rent_payment_for_tenant`, `rent_obligation`, `agent_proxy_investment`, `coo_proxy_investment`, `pending_portfolio_topup`, `proxy_partner_withdrawal`, `wallet_transfer` (debit) categories.

Meanwhile the canonical routing function `wallet_route_for_category(user_id, category, direction)` already routes these to the **float** bucket for agents.

The two sources drifted. Eight agents are currently impacted (any wallet that has ever posted one of those categories).

## The Permanent Fix

Rebuild `v_user_wallet_strict` so its bucket assignment is driven **directly by `wallet_route_for_category(user_id, category, direction)`** instead of a hardcoded list. After this, the view and the routing function can never disagree again — adding a new category to the routing function automatically corrects the view.

No ledger rewrites. No `wallets` table backfill (it's a view — recompute is instant). No data migration. The 8 affected agents — and Onesmus specifically — will display correct float / withdrawable / advance the moment the view is replaced.

## Migration (single file)

```sql
-- 1) Replace the view definition
CREATE OR REPLACE VIEW public.v_user_wallet_strict AS
WITH anchors AS (
  SELECT user_id, anchor_at FROM public.wallet_fresh_start_anchors
),
ledger AS (
  SELECT gl.user_id, gl.category, gl.direction, gl.amount
  FROM public.general_ledger gl
  LEFT JOIN anchors a ON a.user_id = gl.user_id
  WHERE gl.ledger_scope = 'wallet'
    AND (gl.classification IS NULL OR gl.classification = 'production')
    AND (a.anchor_at IS NULL OR gl.created_at >= a.anchor_at)
    AND NOT (
      COALESCE(gl.classification, '') = 'admin_correction'
      AND COALESCE(gl.category, '')  = 'system_balance_correction'
    )
),
routed AS (
  SELECT l.user_id, l.amount, r.bucket, r.sign
  FROM ledger l
  CROSS JOIN LATERAL public.wallet_route_for_category(l.user_id, l.category, l.direction) r
),
buckets AS (
  SELECT
    user_id,
    SUM(CASE WHEN bucket = 'withdrawable'      THEN sign * amount ELSE 0 END) AS withdrawable_raw,
    SUM(CASE WHEN bucket = 'float'             THEN sign * amount ELSE 0 END) AS float_raw,
    SUM(CASE WHEN bucket IN ('advance_credit','advance_repayment')
             THEN sign * amount ELSE 0 END)                                    AS advance_raw
  FROM routed
  GROUP BY user_id
),
holds AS (
  SELECT user_id, COALESCE(SUM(amount), 0) AS pending_holds
  FROM public.withdrawal_requests
  WHERE status = ANY (ARRAY['pending','requested','manager_approved','processing'])
  GROUP BY user_id
),
universe AS (
  SELECT user_id FROM public.wallets_physical
  UNION SELECT user_id FROM buckets
  UNION SELECT user_id FROM holds
)
SELECT
  u.user_id,
  GREATEST(0, COALESCE(b.withdrawable_raw, 0) - COALESCE(h.pending_holds, 0))         AS withdrawable,
  GREATEST(0, COALESCE(b.float_raw, 0))                                                AS float_balance,
  GREATEST(0, COALESCE(b.advance_raw, 0))                                              AS advance_balance,
  COALESCE(h.pending_holds, 0)                                                         AS pending_holds,
  GREATEST(0, COALESCE(b.withdrawable_raw, 0) - COALESCE(h.pending_holds, 0))
    + GREATEST(0, COALESCE(b.float_raw, 0))                                            AS total_visible
FROM universe u
LEFT JOIN buckets b ON b.user_id = u.user_id
LEFT JOIN holds   h ON h.user_id = u.user_id;

-- 2) Defensive: ensure the routing function silently skips junk-classified rows
--    (already filtered above, but harmless to keep IMMUTABLE/STABLE marker correct)

-- 3) Sanity check (run as part of the migration, raises if Onesmus is still wrong)
DO $$
DECLARE v_w numeric; v_f numeric;
BEGIN
  SELECT withdrawable, float_balance INTO v_w, v_f
  FROM public.v_user_wallet_strict
  WHERE user_id = 'e3cf4d3a-d021-49e4-b815-7e1938166eeb';

  IF v_f <> 498000 OR v_w <> 15200 THEN
    RAISE EXCEPTION 'Reseed verification failed for Onesmus: float=%, withdrawable=% (expected 498000 / 15200)', v_f, v_w;
  END IF;
END $$;
```

## Why no row-level reseed is needed

`wallets` is a view derived from `v_user_wallet_strict`, which is derived from `general_ledger`. Replacing the view re-derives every wallet on next read. Onesmus's row will read 498,000 / 15,200 immediately; the other 7 affected agents auto-correct the same way.

## Confirmation that no agent will be hit again

After this migration:

1. The bucket allocation in `v_user_wallet_strict` calls `wallet_route_for_category(user_id, category, direction)` — the **same** function the ledger router, CFO Direct Debit, and `apply_wallet_movement` use.
2. Any new ledger category introduced in the future is routed in **one place** (the function). The view inherits the routing automatically.
3. The migration includes a verification block (`DO $$ … $$`) that fails the deploy if Onesmus's wallet doesn't match the expected post-fix figures.
4. A post-deploy spot check across the 8 currently-affected agents will be run to confirm.

## Code changes

None required in `src/` — the React app reads from the `wallets` view through the existing hooks (`useWallet`, `useAgentBalances`, `get_user_available_balance`). All of those already depend on the strict view.

## Out of scope

- No edits to `agent_allocate_tenant_payment` (both overloads post correctly; the ledger is the source of truth).
- No edits to `apply_wallet_movement` (intentional no-op since 2026-04-23).
- No changes to `general_ledger` rows (immutable by policy).

## Approval requested

Approve and I will submit the migration via the migration tool, then run the post-deploy spot check across the 8 affected wallets.
