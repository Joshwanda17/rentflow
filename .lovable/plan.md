# Production Ledger-Truth Mode — Permanent Drift Elimination

We have 9,150 ledger entries across 762 users since 2026‑02‑11, all timestamped and double‑entry. That history is the legal source of truth. We will rebuild every wallet from it, lock the cached buckets behind it, and remove every code path that can inflate a balance again.

Today's exposure: **78 drifting wallets, +54.4M phantom air, -78.6M hidden debt**, total cache vs ledger gap **UGX 178.9M**. After this work the gap is **0** and stays 0.

---

## Phase 1 — Full per‑user reconciliation from ledger history (one‑shot, CFO‑gated)

For every wallet in the system (6,082), we replay its entire `general_ledger` history (production scope only, ordered by `created_at`), recompute the three buckets exactly as `apply_wallet_movement` would have produced them, and overwrite the cached row. Every adjustment is itself posted as a balanced `admin_correction` ledger pair so the audit trail stays double‑entry.

New RPC: `reconcile_wallet_from_ledger(p_user_id, p_reason)`
- Reads all wallet‑scope production entries for the user, ordered by timestamp.
- Computes target `withdrawable_balance`, `float_balance`, `advance_balance`, `balance` by replaying each entry through the bucket router (`recipient_type` + category).
- Compares to current cached values, posts a balanced correction pair for the delta:
  - if cache > ledger → `system_balance_correction` cash_out from user wallet, cash_in to platform (writedown of phantom air).
  - if cache < ledger → cash_in to user wallet, cash_out from platform (release of hidden owed).
- Flips `wallets.sync_authorized = true` for the duration of the write (only path allowed by the wallet write‑lockdown trigger), then resets it.
- Writes `audit_logs` row with `action_type='wallet_full_reconciliation'`, mandatory ≥10‑char reason, before/after snapshot.
- Emits `system_event` `wallet.reconciled_from_ledger`.

New CFO panel: `LedgerReconciliationPanel` (CFO Reconciliation tab, above the existing PhantomDriftPanel)
- Lists every wallet whose `ROUND(cached) ≠ ROUND(ledger_net)` with: user name, cached buckets, ledger net, delta, direction (phantom vs owed), last ledger entry timestamp.
- "Reconcile" button per row → modal showing the replay preview (bucket‑by‑bucket) → CFO types reason → calls the RPC.
- "Reconcile All Drifting" bulk button → confirmation dialog showing total phantom + total owed → batches calls server‑side with a single `audit_logs` parent row.

Outcome: cached buckets = ledger‑replayed buckets for all 6,082 wallets, zero drift.

---

## Phase 2 — Permanent ledger‑backed display (no more cache‑first numbers)

Today the dashboard sums `wallets.balance` and shows it as truth. We switch every headline figure to a ledger‑backed view so even if the cache ever drifts again, the user never sees inflated money.

New SQL view: `wallet_ledger_truth_view`
- Per user: `ledger_net`, `withdrawable_baseline`, `float_baseline`, `advance_baseline`, `cached_*`, `displayable_withdrawable = max(0, min(cached_withdrawable, max(0, ledger_net)))`.
- RLS: super_admin / cfo / coo / operations read; user reads own row.

Frontend changes:
- `useAgentBalances`, `useAvailableBalance`, `computeLedgerAvailable` → already call `get_user_available_balance`. Confirm and lock that as the only allowed source for displayed withdrawable. Add an ESLint rule (custom) banning direct reads of `wallets.withdrawable_balance` outside `computeLedgerAvailable.ts`.
- CFO Dashboard "What we have / owe / can use" cards → switch to `wallet_ledger_truth_view` aggregates instead of `SUM(wallets.balance)`.
- Wallet Hero cards (agent, supporter, tenant) → show only `get_user_available_balance` value.

Outcome: even between reconciliations, no user or executive ever sees money that isn't in the ledger.

---

## Phase 3 — Permanent write barriers (drift becomes impossible)

The wallet write‑lockdown trigger already exists. We harden it and remove every remaining bypass:

1. **`apply_wallet_movement` becomes the only writer** — already true, but we add a `pg_audit`‑style log table `wallet_write_attempts` capturing every UPDATE on `wallets` with the calling function name. Any non‑`apply_wallet_movement` writer raises an alert.
2. **`sync_wallet_from_ledger` stays a no‑op forever** — add a comment + migration assertion that fails CI if its body ever grows beyond `RETURN NEW;`.
3. **Strict mode default ON in production** — `general_ledger` strict mode (rejects unrouted categories) is flipped from warn to enforce. The two known offenders (`test_funds_cleanup`, `proxy_investment_commission`) get bucket routes added in this migration.
4. **Edge functions audit** — sweep `supabase/functions/` for any direct `update('wallets')` or balance arithmetic outside `apply_wallet_movement` / `create_ledger_transaction`. The repo already has `scripts/guard-frontend-ledger-writes.mjs`; we extend it to also scan edge functions and fail CI on violations.
5. **Drop the legacy ledger‑bypass triggers** — explicitly verify and disable any trigger on `wallets`/`wallet_transactions` that isn't `enforce_wallet_ledger_only` or `apply_wallet_movement`'s posting trigger.

Outcome: every UGX into or out of any wallet must pass through a balanced ledger entry. No exceptions.

---

## Phase 4 — Continuous reconciliation watchdog

- **15‑minute cron** (already exists as `detect_phantom_wallet_drift`) extended to: if any wallet drifts > 1 UGX, it is auto‑logged AND auto‑frozen (`wallets.frozen_reason = 'drift_detected'`) until CFO reviews.
- **Daily reconciliation report** emailed to CFO: count of drifting wallets (target: 0), total phantom, total owed, list of frozen wallets.
- **System event** `wallet.drift_detected` emitted for each occurrence (Trust Mission compliant).
- A frozen wallet blocks withdrawals at the `approve-withdrawal` edge function level until reconciled.

Outcome: any future drift is caught within 15 minutes, the affected user is protected from over‑withdrawal, and CFO is notified the same day.

---

## Phase 5 — Per‑user ledger statement (transparency for users and ops)

New page: `/wallet/statement`
- Lists every `general_ledger` entry for the logged‑in user, oldest → newest, with running balance per bucket.
- Shows the timestamp, category (in user‑friendly terminology — Rent Plan / Returns / Supporter / etc), counterparty, direction, amount, and resulting bucket totals.
- "Download PDF" generates a signed monthly statement.

Same view for CFO (`/cfo/wallet/<user_id>/statement`) — the audit trail any regulator or auditor needs to trace any single shilling end‑to‑end.

---

## Technical summary

New DB objects:
- RPC `reconcile_wallet_from_ledger(uuid, text)`
- View `wallet_ledger_truth_view`
- Table `wallet_write_attempts` (audit only)
- Extended cron `detect_phantom_wallet_drift` with auto‑freeze

Code changes:
- New panel `src/components/cfo/LedgerReconciliationPanel.tsx`
- New page `src/pages/wallet/Statement.tsx` + CFO variant
- Update CFO dashboard cards to use `wallet_ledger_truth_view`
- Extend `scripts/guard-frontend-ledger-writes.mjs` to cover edge functions
- Custom ESLint rule banning `withdrawable_balance` reads outside the approved file

Migrations are sequenced so Phase 1 reconciliation runs against the still‑permissive trigger, then Phase 3 hardens. Phase 2 ships in the same release as Phase 1 so dashboards never show pre‑reconciliation numbers.

After this rolls out: cached balance always equals ledger replay, no path exists to make them diverge, and every shilling has a timestamped, double‑entry trail back to its origin.
