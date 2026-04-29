## Goal

Detect when a wallet's `withdrawable_balance` deviates from its strict ledger-anchored expected value (`baseline_withdrawable + (ledger_net_now - baseline_ledger_net)`) by more than a configurable UGX threshold, and automatically raise a CFO-visible alert.

This complements the existing `detect_phantom_wallet_drift` job (which compares `wallets.balance` vs total ledger net). The new job is **withdrawable-bucket-specific** and **baseline-anchored** — matching the new strict withdrawable rule.

## How it works

```text
expected_withdrawable = baseline_withdrawable + (ledger_net_now - baseline_ledger_net)
deviation             = withdrawable_cached - max(0, expected_withdrawable)
alert IF |deviation| >= threshold_ugx
```

Threshold is configurable per severity tier, stored in a single config row, editable by the CFO from the dashboard.

## Backend (migration)

1. **`wallet_drift_alert_config`** (single row, seeded)
   - `low_threshold_ugx` (default 50,000)
   - `medium_threshold_ugx` (default 250,000)
   - `high_threshold_ugx` (default 1,000,000)
   - `critical_threshold_ugx` (default 10,000,000)
   - `enabled` boolean (default true)
   - `updated_by`, `updated_at`
   - RLS: read = `cfo`/`manager`, update = `cfo`/`manager`.

2. **`wallet_withdrawable_drift_alerts`** table
   - `user_id`, `withdrawable_cached`, `expected_withdrawable`, `baseline_withdrawable`, `baseline_ledger_net`, `ledger_net_now`, `deviation_amount`, `deviation_direction` (`overstated` | `understated`), `severity`, `status` (`open|investigating|resolved|false_positive`), `first_detected_at`, `last_detected_at`, `resolved_at`, `resolved_by`, `resolution_notes`, `detection_run_id`, timestamps.
   - Unique partial index on `user_id WHERE status IN ('open','investigating')` so a user has at most one open alert.
   - RLS: select/update = `cfo`/`manager` only.

3. **`detect_withdrawable_drift_alerts()`** RPC (`SECURITY DEFINER`, `search_path=public`)
   - Reads the config row; aborts with `enabled=false`.
   - For each user with a row in `wallet_ledger_baseline`:
     - Compute `ledger_net_now` from `general_ledger` (wallet scope, production+admin_correction).
     - Compute `expected_withdrawable`.
     - Compare with `wallets.withdrawable_balance`.
     - If `|deviation| >= low_threshold` → upsert open alert with severity tier matching the highest threshold crossed.
   - Auto-resolve open alerts whose deviation has fallen back below `low_threshold`.
   - Emit a `system_event` (`wallet.drift_alert.raised`) per new critical/high alert (Trust Mission compliance).
   - Returns `jsonb` summary (run_id, new, updated, auto_resolved, total_deviation_ugx).

4. **Cron job** `detect-withdrawable-drift-alerts-every-15min` (offset 5 minutes from phantom drift to avoid contention) calling the RPC via `net.http_post` (registered via insert tool, not migration, since it carries the project URL/anon key).

## Frontend (CFO Reconcile tab)

5. **`WithdrawableDriftAlertsPanel.tsx`** (mirrors `PhantomDriftPanel`)
   - Filters: status, severity.
   - Columns: user (name/phone), cached vs expected, deviation, severity, status, last detected.
   - Actions: Investigate / Resolve / Mark false positive / Run detection now.
   - "Configure Thresholds" dialog editing `wallet_drift_alert_config` (CFO-only).
   - Mounted next to `<PhantomDriftPanel />` in `src/pages/cfo/Dashboard.tsx`.

## Files

- New migration: `supabase/migrations/<ts>_withdrawable_drift_alerts.sql` (tables, RPC, RLS, indexes).
- Cron registration via insert tool (not in migration).
- New: `src/components/cfo/WithdrawableDriftAlertsPanel.tsx`.
- Edited: `src/pages/cfo/Dashboard.tsx` (mount panel under Reconcile tab).
- Memory: append rule to `mem://index.md` Core + new file `mem://features/cfo/withdrawable-drift-alerts.md`.

## Out of scope

- No automatic clamp of balances (operators decide). This system only **alerts**.
- No SMS/email — CFO dashboard surfacing only (matches existing `phantom_wallet_drift` UX). SMS can be added later by emitting an Inngest event from the RPC.