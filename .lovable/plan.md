## Goal

In the Financial Ops "Wallet Deduction" search list (the screen in your screenshot), the `Balance` column currently reads from the cached `wallets.balance` column. Per the platform's core rule ("Wallets are UI caches; the ledger is the source of truth"), we will replace these cached numbers with **ledger-true** balances, so users like LUKODDA JOSEPH, ATUHAIRE CAROLYNE, and LOLEM FIRICILA show what they can actually move — not stale cached figures.

We will also force any existing cached query results to be discarded and refetched.

## Scope

Single file: `src/components/financial-ops/WalletDeductionPanel.tsx`

No database / edge function changes are required — the existing `get_user_available_balance(_user_id uuid)` RPC already returns the ledger-true available figure (the LESSER of cached balance and ledger net).

## Changes

### 1. Both search queries — overlay ledger-true balance

For both `deduction-user-search` (search by name/phone) and `deduction-balance-search` (search by balance range):

- After fetching the candidate rows, fan out parallel `get_user_available_balance` RPC calls for each user id (capped at 100 rows so this is safe).
- Replace each row's `balance` with the returned `available` value.
- If the RPC fails for a row, fall back to `0` (not the cached value) and tag the row so the UI can show "—" instead of a misleading cached number.

### 2. Header label

Change the column header from `Balance` to `Available (ledger)` so it's explicit that the figure is the ledger-true withdrawable amount, not a cached snapshot.

### 3. Total line

Update the `3 wallets found · Total: USh …` line to sum the **ledger-true** balances rather than the cached ones.

### 4. Force-erase any cached query state

- Bump the `queryKey`s to `['deduction-user-search', 'v2-ledger', searchQuery]` and `['deduction-balance-search', 'v2-ledger', …]`. This invalidates every browser's existing React Query cache for the old keys on next mount, so no user sees stale data after deploy.
- Set `staleTime: 0` and `gcTime: 0` on both queries so results are never re-served from cache.
- On mount, call `queryClient.removeQueries({ queryKey: ['deduction-user-search'] })` and the same for `deduction-balance-search` to wipe any previously cached entries from the old keys.

### 5. Mutation invalidation

After a successful deduction, also invalidate `['deduction-available-balance']` (the per-user ledger query already used at the deduction screen) so the post-deduction figure is fresh.

## Out of scope

- No DB migration. The cached `wallets.balance` column stays as-is; ledger triggers continue to maintain it. We are only changing what the UI renders.
- Other wallet surfaces (agent hero card, unified wallet card) already use `useAvailableBalance` and are correct.

## Technical notes

- Parallelism: `Promise.all(userIds.map(id => supabase.rpc('get_user_available_balance', { _user_id: id })))`. With the existing 10-row (name search) and 100-row (balance search) caps, this is well within Supabase's per-request budget.
- RPC return shape: `{ available, wallet_cached, ledger_net, has_drift }` — we use `available`.
- No type changes needed; `UserResult.balance: number` still applies.
