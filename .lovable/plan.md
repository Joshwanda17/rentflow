# Phase A + C — Lock the cache, retire the panels (skip B)

Scope confirmed: harden the database against any wallet-cache writes, repoint the one function that still reads cache columns, and delete the reconciliation UI surfaces. **No cache-zeroing in this push** — existing phantom figures stay in `wallets_physical` but become read-only; user-facing balances are already strict via `get_user_available_balance`, so users see no inflated numbers regardless.

## Phase A — Database lockdown (single migration, one transaction)

1. **Rewrite `apply_wallet_movement(p_user_id, p_amount, p_category, p_recipient_type, p_metadata)`**
   - Remove every `UPDATE wallets_physical SET balance/withdrawable_balance/float_balance/advance_balance` line.
   - Keep: routing decision, `wallet_unrouted_movements` insert when `recipient_type` missing, `wallet_routing_violations` insert on mismatch, `system_events` emit (`wallet.movement_recorded`), `wallet.updated` realtime notify.
   - Return value unchanged (routed bucket name) so callers don't break.
2. **Harden `enforce_wallet_ledger_only` trigger on `wallets_physical`**
   - Drop the `current_setting('wallet.sync_authorized', true) = 'true'` bypass.
   - Any `UPDATE` touching `balance`, `withdrawable_balance`, `float_balance`, `advance_balance` raises `EXCEPTION 'wallet bucket columns are immutable - ledger is the only source of truth'` for ALL roles including `service_role` and `postgres` (except a single break-glass GUC `wallet.break_glass_admin=true` settable only by superuser, for true emergencies — logged to `audit_logs`).
   - `locked_balance`, `currency`, `updated_at` remain writable.
3. **Drop `instead_of_wallets_dml` trigger on the `wallets` view** for UPDATE. Keep INSERT (provisioning) and DELETE paths intact via a slimmer INSTEAD OF trigger. Any code still doing `UPDATE wallets SET balance=...` will now error loudly.
4. **Repoint `agent_allocate_tenant_payment`** — currently reads locked commission from `wallets_physical.withdrawable_balance` (per existing memory). Rewrite to read from `get_user_available_balance(p_agent_id)` so it survives the lockdown. This is mandatory — without it, agent float allocation 500s on first call after deploy.
5. **Permanent no-op bodies** for `sync_wallet_from_ledger`, `reseed_anchored_withdrawable`, and any `wallet-cache-sweep` SQL function — return immediately. Triggers stay attached for ABI compat.
6. `NOTIFY pgrst, 'reload schema';`

After this commits: it is physically impossible for any code path to mutate cache buckets. Phantom figures in `wallets_physical` become inert forensic data.

## Phase C — Frontend + nav cleanup

**Delete components:**
- `src/components/cfo/CFOReconciliationPanel.tsx`
- `src/components/cfo/PhantomDriftPanel.tsx`
- `src/components/cfo/AnchoredCacheDriftPanel.tsx`
- `src/components/cfo/CacheSweepPanel.tsx`
- `src/components/cfo/LedgerReconciliationPanel.tsx`
- `src/components/cfo/WalletReconciliationAuditPanel.tsx`
- `src/components/cfo/NegativeWalletReconciliationPanel.tsx`
- `src/components/cfo/AgentCashReconciliation.tsx`
- `src/components/financial-ops/ReconciliationDashboard.tsx`
- `src/components/financial-ops/ReconciliationReviewScreen.tsx`
- `src/components/ledgers/SettlementReconciliationLedger.tsx`

(Exact file list will be confirmed by `rg` before deletion; any additional reconciliation/drift/cache-sweep panels found get the same treatment.)

**Prune navigation + tabs:**
- Remove `reconciliation` tab from `src/pages/cfo/Dashboard.tsx` and `src/pages/CFODashboard.tsx`.
- Remove the Reconciliation entry from `src/components/layout/executiveSidebarConfig.ts`.
- Remove the Reconciliation section from `src/components/financial-ops/FinancialOpsCommandCenter.tsx`.
- Add a redirect: if a user lands on `?tab=reconciliation`, send them to the default CFO tab (overview/ledger).

**No replacement panel.** The existing CFO Ledger view already shows raw `general_ledger`. If a gap surfaces later we add a single read-only panel then.

## Diagnostic tables — kept silent

`phantom_wallet_drift`, `wallet_overdraw_events`, `wallet_unrouted_movements`, `wallet_routing_violations`, `wallet_withdrawable_drift_alerts` and their cron jobs stay in place. They should now stay empty forever. No UI surfaces them. If a row appears, the drift detection cron emits `wallet.drift_alert.raised` → CFO gets a notification only. Drop after 30 clean days.

## Memory updates

After deploy:
- Add Core rule: **"Wallet bucket columns are immutable. `general_ledger` + `get_user_available_balance` are the only truth. `wallets_physical` is forensic-only."**
- Mark the following memories as superseded (replace with one consolidated `mem://architecture/ledger-only-wallet`): `wallet-write-lockdown`, `wallet-sole-writer`, `anchored-cache-drift`, `agent-float-allocation-commission-source`, `phantom-drift-monitor`.
- Remove references to the deleted panels from `fin-ops/dashboard-governance` and any CFO-related memory.

## Risks acknowledged

1. **Loud failures replace silent drift.** Edge function logs are the early-warning system for 24h. Any unknown caller that mutated buckets will 500.
2. **`agent_allocate_tenant_payment` repoint is in-scope** and is the highest-risk change — covered by step A.4.
3. **Cache figures remain elevated in `wallets_physical`.** This is intentional (Phase B skipped). Users never see them — UI uses `get_user_available_balance`. CFO forensic queries against raw `wallets_physical` will still show the old inflated numbers; any such CFO tooling must be repointed to `v_user_wallet_strict`. Will grep for direct `wallets_physical` reads during execution and flag/repoint as needed.
4. **No user-facing impact expected.**

## Execution order on approval

1. `rg` audit for: direct `wallets_physical` writes, direct bucket-column reads, full reconciliation component list.
2. Write the migration (single transaction).
3. Apply migration.
4. Verify: try a no-op `UPDATE wallets_physical SET balance=balance WHERE user_id=<test>` → must raise. Confirm `apply_wallet_movement` no longer touches cache.
5. Delete components + prune nav + add redirect.
6. Update memory index.

Approve and I execute exactly this.
