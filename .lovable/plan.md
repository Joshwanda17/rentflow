# Wallet Balances Projection — Ledger-Driven, No Cache

Adopts your recommendation in full. The ledger stays authoritative; reads move to a deterministic projection updated inside the same transaction as every ledger insert; withdrawals still revalidate against the ledger at commit time.

## Goals

- One indexed row-lookup per wallet read (no aggregation on the read path).
- Projection can be dropped and rebuilt from `general_ledger` at any time.
- Withdrawals do a final ledger-authoritative check before committing.
- No Redis, no client cache of balances, no nightly-only sync.

---

## 1. New table: `wallet_balances_projection`

```text
user_id (PK) │ withdrawable │ float │ advance │ locked │ restricted_held │ pending_holds │ total_visible │ ledger_version │ updated_at
```

- `ledger_version` = monotonically increasing counter incremented on every ledger insert affecting the user (used to detect drift).
- `pending_holds` = sum of un-posted `withdrawal_requests` in flight (kept accurate by the same trigger set that today feeds `v_user_wallet_strict`).
- Indexed by `user_id`; `GRANT SELECT` to `authenticated`, full to `service_role`; RLS: user reads own row, ops roles read all.

## 2. Populate atomically from the ledger write path

- `AFTER INSERT` trigger on `general_ledger` (row-level, same transaction):
  - For each `wallet_bucket` leg with a `user_id`, apply the signed delta to the matching projection column.
  - Increment `ledger_version`; stamp `updated_at`.
- `AFTER INSERT/UPDATE/DELETE` trigger on `withdrawal_requests` recomputes `pending_holds` for that user (cheap: filter by user_id + status set).
- `AFTER UPDATE` on `general_ledger.maturity_expired` moves amounts out of `restricted_held` into `withdrawable`.
- All triggers run in the same transaction as the ledger write — ledger and projection commit together or roll back together.

## 3. Rebuild + reconciliation

- `rebuild_wallet_projection(p_user_id uuid default null)` — deterministic full recompute from `general_ledger` + `withdrawal_requests`. Truncate + reinsert when called without a user id.
- `pg_cron` every 15 min: sample 500 users, compare projection to a fresh ledger recompute, write divergences to a new `wallet_projection_drift_alerts` table, and self-heal that row.
- CFO Reconcile tab gets a `Projection drift` panel (extends the existing anchored/strict drift panels).

## 4. Read path

- Replace the `public.wallets` view with `SELECT ... FROM wallet_balances_projection`.
- `get_user_available_balance(uuid)` becomes a single-row lookup returning `LEAST(withdrawable, ledger_backed)` — still clamped, still strict, but O(1).
- New `get_wallets_batch(uuid[])` for dashboards to replace N+1 patterns (`useOpsWallet`, priority lists, agent capacity map, etc.).

## 5. Withdrawal-time authoritative check (unchanged in spirit)

- `approve-withdrawal` edge fn keeps calling `create_ledger_transaction` with `skip_balance_check: false`.
- The existing `enforce_no_negative_wallet_ledger` trigger — which recomputes from `v_user_wallet_strict` at posting time — stays as the final gate. Fast UI, correct commit.

## 6. Retire the aggregating view

- `get_user_wallet_view(uuid)` becomes a thin wrapper over the projection (kept for backward compatibility, then deprecated).
- Delete the CPU-hot ledger-scanning path from the view definition and remove `wallets`' dependency on it.

## 7. Investigate the 526k read volume

Symptom, not disease — separate follow-up work after the projection lands:
- Consolidate the three balance hooks (`useAvailableBalance`, `useOpsWallet`, `useAgentBalances`) onto one shared query key.
- Batch dashboard reads via `get_wallets_batch`.
- Extend React Query `staleTime` on wallet reads to 30s (projection updates are pushed via realtime on `wallet_balances_projection`).

---

## Technical section

**Migrations (schema only)**
1. Create `wallet_balances_projection` + indexes + GRANTs + RLS.
2. Create `wallet_projection_drift_alerts` + GRANTs + RLS.
3. Functions: `rebuild_wallet_projection`, `apply_ledger_delta_to_projection`, `recompute_pending_holds`, `get_wallets_batch`, updated `get_user_available_balance`.
4. Triggers on `general_ledger` and `withdrawal_requests`.
5. Replace `public.wallets` view definition with a straight select from the projection.

**Data step (via insert tool, not migration)**
- `SELECT rebuild_wallet_projection(NULL);` — full backfill.
- Immediately follow with a drift check; log & repair any deltas before wiring the read path over.

**Edge functions**
- `approve-withdrawal`: no change to safety semantics, but drop the redundant pre-check `SELECT` against `wallets` (the DB trigger is authoritative).
- `cfo-direct-credit`, `wallet-transfer`, `apply-payroll-growth`, etc.: unchanged — they already write through `create_ledger_transaction`; projection updates via the new trigger.

**Frontend**
- `useAvailableBalance`, `useOpsWallet`, `useAgentBalances`, `fetchOpsWalletBuckets` → point at projection / `get_wallets_batch`.
- Add realtime subscription on `wallet_balances_projection` filtered by `user_id` for the wallet hero card.
- Remove the last direct `general_ledger` sums used for display (dashboards, statements keep raw ledger reads — those aren't balance decisions).

**Rollout order (single day, safe)**
1. Ship schema + triggers + rebuild function (dark — nothing reads it yet).
2. Backfill via `rebuild_wallet_projection(NULL)`.
3. Run drift check; must be zero for 100% of users before flipping.
4. Swap `wallets` view + hooks to the projection.
5. Enable 15-min drift cron.
6. Follow-up ticket: read-volume consolidation (item 7 above).

**Explicitly out of scope**
- Redis, client-persisted balances, nightly-only refresh.
- Any change to the double-entry `general_ledger` integrity trigger.
- Terminology or product changes.

Approve and I'll ship steps 1–5 in order, with drift verification between each.
