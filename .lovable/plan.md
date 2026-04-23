

# Safe path to fix wallet drift — zero impact on withdrawals, deposits, transactions

Goal: stop phantom drift at its source **without** pausing money movement, without changing balances, and without breaking any of the 54 edge functions touching wallets.

## The core idea: neutralize, don't delete

We don't remove triggers (risky — many functions depend on side effects). We don't touch balances (risky — would reconcile away real losses). Instead we make the **two conflicting triggers cooperate** by demoting one to a no-op while keeping its function signature alive, then close the silent-floor leak that hides overdraws.

This is done in **3 small, reversible migrations**, each independently safe.

---

## Migration 1 — Make `sync_wallet_from_ledger` a no-op (stop the double-count)

**Problem**: Two triggers update `wallets.balance` per ledger insert → double-count.

**Fix**: Rewrite `sync_wallet_from_ledger()` body to `RETURN NEW;` immediately. Keep the trigger attached, keep the function signature, keep its name in pg_proc — so any code/migration that references it still works. It just stops mutating anything.

`apply_wallet_movement` becomes the **sole writer** to `wallets.balance` (it already sets `balance = withdrawable + float` correctly).

**Impact on live ops**: 
- Deposits: still work — `apply_wallet_movement` handles them.
- Withdrawals: still work — same path.
- Transfers: still work.
- **Zero balance changes** at the moment of migration. Future inserts stop double-counting.

**Reversible**: one-line restore of the old function body.

## Migration 2 — Convert silent floor into a logged event (stop hiding overdraws)

**Problem**: `enforce_non_negative_balance` silently sets `balance := 0` when a debit would go negative → ledger keeps the -50M, wallet shows 0, drift = +50M forever.

**Fix**: Modify the trigger to:
1. Still floor at 0 (so no withdrawal flow breaks on a negative-balance constraint).
2. **Insert a row into a new `wallet_overdraw_events` table** capturing `(user_id, attempted_balance, clamped_to, ledger_entry_id, created_at)`.
3. Emit a `system_event` of type `wallet_overdraw_clamped`.

This way every future overdraw is **visible and attributable** instead of becoming silent phantom drift. Existing flows continue unchanged.

**Impact on live ops**: None. Same clamp behavior, just observable now.

## Migration 3 — Make unroutable categories visible (stop structural gap)

**Problem**: When `apply_wallet_movement` sees a category with `route='none'`, it silently does nothing. `sync_wallet_from_ledger` (now neutered) used to compensate. Post-Migration 1, these inserts will move nothing → bucket-vs-balance mismatch.

**Fix**: In `apply_wallet_movement`, when `route='none'`:
- Do NOT raise (would break edge functions mid-flight).
- Insert into a new `wallet_unrouted_movements` table: `(category, ledger_entry_id, amount, user_id, suggested_bucket)`.
- Emit `system_event` `wallet_category_unrouted`.

Lets us migrate categories one-by-one to the router without breaking any function. The two known offenders (`test_funds_cleanup`, `proxy_investment_commission`) will surface immediately, plus any others.

**Impact on live ops**: Same behavior as today for unrouted categories (no movement), but now observable.

---

## What this does NOT do (intentionally)

- Does **not** change a single wallet balance.
- Does **not** reconcile historical phantom drift (the 117M is pre-existing — handled separately later via targeted `admin_correction` entries once the bleeding stops).
- Does **not** delete any trigger or function (full backward compatibility).
- Does **not** modify any of the 54 edge functions.
- Does **not** touch RLS, withdrawals queue, deposit approval, or transfer flow.

## After all 3 migrations

Within 15 min the `phantom_wallet_drift` cron will stop generating *new* drift rows. Two new tables (`wallet_overdraw_events`, `wallet_unrouted_movements`) will surface the categories of leakage that previously went silent. Then in a follow-up round we:
1. Patch the 2 unallowlisted categories.
2. Backfill historical drift with `admin_correction` entries (one wallet at a time, with full audit trail).

## Safety order & rollback

1. Apply Migration 1. Watch `phantom_wallet_drift` cron output for 1 hour. Watch `system_events` for any abnormality.
2. If stable → apply Migration 2.
3. If stable → apply Migration 3.

Each migration has a one-line rollback (restore prior function body). All three are pure trigger/function rewrites — no schema breakage, no data movement.

## Approval needed

Approve and I'll prepare the 3 migrations in order, executing them one at a time with a verification query between each. **No balances will change. No edge function will be modified. No money movement will be paused.**

