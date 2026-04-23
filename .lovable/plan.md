

# Fix: wallet digits not updating in the UI + phantom balances

Two real bugs are converging into the symptom you see. We'll fix both, then reconcile the bad data (including Collines).

## Root causes (verified in DB + code)

**1. The 3-bucket router is OFF in the database.**
The trigger `general_ledger_route_buckets` on `general_ledger` is **disabled** (`tgenabled='D'`). Only the legacy `sync_wallet_from_ledger` runs, which updates the headline `balance` column but never touches `withdrawable_balance / float_balance / advance_balance`. Result:
- Withdrawals check `withdrawable_balance` (0) → look like nothing happened, but `balance` was the real money.
- CFO retractions debit `balance` while buckets sit at stale values, or vice-versa.
- Collines's wallet shows `balance=10000`, buckets all 0 — physically impossible under the documented model.
- An old `system_balance_correction` of 2,149,908 was inserted as `cash_in` with **no balanced `cash_out` partner**, which is how the 2M phantom appeared in his wallet originally.

**2. The tenant wallet UI hides realtime updates behind a 30-second cache.**
`src/hooks/useWallet.ts` keeps a module-level `walletCache` (TTL 30s) **and** mirrors to `localStorage`. On first paint and on every component remount it shows the stale cached number. The realtime channel listens only to `UPDATE` events — `INSERT` of a brand-new wallet, or any case where the row id changes, is missed. After a withdrawal succeeds, `refreshWallet` is called only inside `sendMoney`; for withdrawals the UI just waits for realtime, which races the cache.

Additionally, `useWallet` only reads `balance`. It never reads `withdrawable_balance`, so it cannot reflect the bucket reality even when realtime fires.

## What we'll change

### A. Database — restore the bucket invariant

**A1. Enable the bucket router.**
```sql
ALTER TABLE public.general_ledger ENABLE TRIGGER general_ledger_route_buckets;
```
From this point forward every `cash_in` / `cash_out` ledger entry routes into the correct bucket, and the legacy `sync_wallet_from_ledger` continues to keep the headline `balance` consistent.

**A2. Add a hard invariant trigger on `wallets`.**
A new `BEFORE UPDATE` trigger `enforce_bucket_invariant` rejects any write where `balance != withdrawable_balance + float_balance + advance_balance` (skipped only when the legacy sync session flag is set during the same statement). This stops new drift forever.

**A3. Reconciliation migration (one-shot).**
For every wallet where `balance != Σbuckets`, replay the last-known truth from the ledger:
- Recompute `balance` as `Σ(cash_in - cash_out)` over `ledger_scope='wallet'` for that user.
- Recompute each bucket using the existing `route_buckets` category map.
- If a wallet has no offsetting entry (like Collines's `system_balance_correction` of 2,149,908), we insert a balanced `cash_out` admin-correction entry with `category='admin_correction'`, `classification='admin_correction'` and a clear reason ("Phantom balance correction — no original cash_out partner found"). This zeroes the phantom **through the ledger**, leaving an audit trail instead of a silent wallet UPDATE.
- Output a CSV report of every adjusted wallet to `audit_logs` so CFO can review.

**A4. Backfill realtime publication for `general_ledger`.**
`general_ledger` is published but its `replica_identity` is `default`, which prevents `UPDATE`/`DELETE` payloads. Set `REPLICA IDENTITY FULL` so subscribers reliably receive every event the UI needs.

### B. Frontend — make the wallet UI tell the truth

**B1. Rewrite `src/hooks/useWallet.ts` as a React Query hook.**
- New `queryKey: ['wallet', userId]`, `staleTime: 0`, `refetchOnWindowFocus: true`.
- Selects **all bucket fields** (`balance, withdrawable_balance, float_balance, advance_balance, locked_balance, updated_at`).
- Drops the 30-second `walletCache` and `localStorage` mirror entirely (offline cache stays via existing `cacheWallet`, but it no longer suppresses fresh data).
- Internally calls `useWalletRealtime(userId)` so the existing global hook handles `INSERT`/`UPDATE`/`DELETE` on `wallets`, `wallet_deductions`, and `general_ledger` — the cache is invalidated, not patched, so we never display a stale row.
- Returns the same `{ wallet, refreshWallet, sendMoney, … }` API so no call sites break.

**B2. Force refresh after every wallet-affecting mutation.**
Audit the four flows that move money but don't refresh:
- `WithdrawFlow` (calls `withdraw-request` edge function) → on success, `queryClient.invalidateQueries({ queryKey: ['wallet'] })` and `['agent-split-balances']`.
- `DepositFlow` → same invalidation on success.
- CFO `wallet-deduction` (admin-side) — already invalidates `cfo-wallet-deductions`; add `['wallet']` so the impacted user's UI updates if they're online.
- Tenant rent payment → already triggers via realtime; verify and add explicit invalidation as a belt-and-suspenders.

**B3. Show the bucket reality in the wallet card.**
`CollapsibleWalletCard` and `FullScreenWalletSheet` currently show `wallet?.balance` only. Add a small "Available to withdraw: UGX X" line under the headline (driven by `withdrawable_balance`) so users see exactly what they can pull out. Tenants will no longer be confused when they see UGX 10,000 on top but withdrawals refuse — they'll see "Available to withdraw: UGX 0" and understand.

**B4. Optimistic decrement on withdraw.**
When a withdrawal request is approved (status → `approved` realtime event on `withdrawal_requests`), eagerly subtract the amount from `wallet.withdrawable_balance` in the cache, then let the realtime `UPDATE` from `wallets` confirm. This makes the digits move the instant the back office approves, instead of waiting for the next React Query refetch.

### C. Observability

- Add a `phantomBalanceReport` admin page under CFO that lists wallets where `balance ≠ Σbuckets` (currently 11 rows), with a "Reconcile via ledger" button that calls a new edge function `reconcile-wallet-buckets`. This gives CFO/FinOps a permanent self-service tool, so this class of drift never silently piles up again.

## Files

**New**
- `supabase/migrations/<ts>_enable_bucket_router_and_reconcile.sql` — A1, A2, A3, A4 + the one-shot data fix.
- `supabase/functions/reconcile-wallet-buckets/index.ts` — admin-only, replays ledger → buckets for one or many user_ids.
- `src/pages/cfo/PhantomBalanceReport.tsx` — UI for C.

**Modified**
- `src/hooks/useWallet.ts` — full rewrite to React Query + realtime, exposes bucket fields.
- `src/components/wallet/CollapsibleWalletCard.tsx`, `src/components/wallet/FullScreenWalletSheet.tsx` — render `withdrawable_balance` line.
- `src/components/payments/WithdrawFlow.tsx`, `src/components/payments/DepositFlow.tsx` — invalidate `['wallet']` on success.
- `supabase/functions/wallet-deduction/index.ts` — already writes through ledger; no logic change, but bucket router (now enabled) will correctly debit `withdrawable_balance` for `wallet_deduction` category.

## How we'll verify

1. Run `SELECT user_id, balance, withdrawable_balance + float_balance + advance_balance FROM wallets WHERE balance <> withdrawable_balance + float_balance + advance_balance` after the migration → expect **0 rows**.
2. Collines's wallet: `balance=0`, all buckets=0, with a fresh `admin_correction` ledger pair documenting the phantom 2,149,908 and the leftover 10,000 wallet_transfer being routed into the correct bucket.
3. Manually run a CFO retraction in preview → digits in the affected user's wallet card move within ~1 second without a page refresh.
4. Manually approve a withdrawal in preview → withdrawing user's "Available to withdraw" decrements immediately.
5. Open two browser tabs as the same user → mutating in tab A reflects in tab B without refresh.

