# Hybrid: Fresh-Start Anchor + Historical Review Queue

## The problem (one paragraph)

`get_user_available_balance` defines withdrawable as `min(cache, max(0, production_ledger_net)) − pending_holds`. For 34 agents the production ledger net is negative (LOLEM: −4.53M, system-wide drag: 114M UGX) due to historical CFO retractions, float settlements, and unmatched `wallet_deduction` rows. Any new commission posted today gets absorbed by that negative drag and shows 0 in the UI. We need to (a) anchor each agent's "starting line" at today so future earnings are visible immediately, and (b) keep the 142M of historical phantom cache locked behind a CFO-approved review queue.

## The fix in two parts

### Part 1 — Fresh-Start Anchor (so today's commission is withdrawable)

Introduce a per-user anchor that the strict-rule RPC subtracts from the ledger window. Effectively: "ignore all production ledger entries dated before this user's anchor".

- **New table** `wallet_fresh_start_anchors`
  - `user_id uuid PK references auth.users`
  - `anchor_at timestamptz not null default now()`
  - `pre_anchor_ledger_net numeric not null` — the production net frozen at the moment of anchoring (informational; matches what was clamped)
  - `reason text not null` — e.g. "2026-04-29 system-wide commission reset"
  - `created_by uuid` — CFO/system actor
  - `notes text`
- **One-time backfill migration**: insert one row per agent where production net < 0 (the 34 agents), with `anchor_at = '2026-04-29 00:00:00 Africa/Kampala'` and `pre_anchor_ledger_net` = today's negative value. Agents with non-negative net are NOT anchored — they continue to use the standard rule.
- **Modify `get_user_available_balance`** so the `_ledger_net_now` computation only sums entries with `created_at >= anchor.anchor_at` when an anchor exists. The strict rule (`min(cache, max(0, ledger_net)) − pending_holds`) is preserved verbatim — only the ledger window narrows.
- **Cache cap stays in force**. Anchoring a user does NOT release their pre-anchor cached balance. LOLEM's 1.58M cache will still be clamped to whatever the post-anchor ledger justifies (so today's +2,000 makes 2,000 withdrawable, not 1.58M).

Result for LOLEM after migration:
- `prod_net (post-anchor)` = +2,000 (today's commission only)
- `min(cache 1,585,633, 2,000) − 0 = 2,000` withdrawable ✓
- Tomorrow she earns another 5,000 → withdrawable becomes 7,000 ✓
- Her 1.58M historical cache remains visible in CFO drift reports but unreachable.

### Part 2 — Historical Review Queue (the 142M of phantom cache)

The 34 anchored agents collectively hold ~142M of cache that the strict rule was hiding. Surface it for explicit CFO action.

- **New table** `wallet_historical_drift_review`
  - `user_id uuid`, `cached_withdrawable numeric`, `pre_anchor_ledger_net numeric`, `phantom_amount numeric` (cache − max(0, pre_anchor_net))
  - `status text` — `pending_review` | `approved_release` | `approved_writedown` | `escalated`
  - `cfo_decision text`, `cfo_actor uuid`, `decided_at timestamptz`, `correction_ledger_id uuid`
  - One row per anchored agent, populated by the same migration.
- **CFO Reconcile UI tab** "Historical Drift Review" — table of the 34 agents sorted by phantom_amount desc (LUKODDA 90.7M, ATUHAIRE 48M, … LOLEM 1.58M). Each row has two actions:
  - **Release** → posts a balanced `admin_correction` ledger pair that lifts the post-anchor production net by the released amount, making the cached value withdrawable. Records the ledger id back on the review row.
  - **Write-down** → posts a balanced ledger pair that reduces the cache to match production net. Cache and ledger end aligned at zero or the agreed figure.
  - Both actions require the standard 10-char audit reason and write to `audit_logs`.
- No automation, no batch — every release/writedown is a deliberate CFO click.

## Forward guarantee

Because anchoring is per-user and only fires when a user starts negative, all *new* agents and all currently-positive agents see no behavior change. From today onward, any agent who collects rent gets their 10% commission credited via `apply_wallet_movement` and it shows up in the wallet card the same minute — no drag, no clamp, no CFO approval needed for the day-to-day flow.

## Files / surfaces touched

- `supabase/migrations/<ts>_wallet_fresh_start_anchor.sql` — new tables + backfill + updated `get_user_available_balance`
- `src/components/cfo/HistoricalDriftReviewPanel.tsx` — new tab inside the existing CFO Reconcile screen
- `src/hooks/useHistoricalDriftReview.ts` — list + release/writedown mutations (calls two new RPCs `release_historical_drift` and `writedown_historical_drift`)
- Memory updates: extend [Wallet Withdrawable Strict Rule](mem://architecture/wallet-baseline-anchor) to document the anchor exception; add a new memory `mem://features/cfo/historical-drift-review` for the queue.

## Out of scope

- No change to `apply_wallet_movement`, no change to commission posting paths, no change to the existing `phantom_wallet_drift` cron — the anchor is purely a read-side window.
- No bulk auto-release or auto-writedown. Every one of the 34 agents is a deliberate CFO decision.
- No change to non-anchored users.

## Confirmations needed before I switch to default mode

1. Anchor timestamp = **2026-04-29 00:00 Africa/Kampala** for all 34 agents — correct?
2. CFO is the only role allowed to release/writedown — correct (not COO, not FinOps)?
3. Should the migration auto-create the 34 anchor rows, or do you want to gate even the anchoring behind a CFO confirm-each-agent screen first?

If yes/yes/auto-create, I'll proceed straight to implementation on approval.