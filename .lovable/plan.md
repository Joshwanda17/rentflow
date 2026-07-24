
# Enterprise UI Performance — Zero-Cache Deduplication

## Guiding rule (hard constraint from you)

**No wallet caching.** Every wallet read hits `get_user_wallet_view` (already strict/ledger-derived — the same math the ledger statement uses). The wallet card and the ledger will always show the same number because they will read from the same RPC through the same hook.

The 526k call volume is not solved by caching stale values. It is solved by:

1. **In-flight request dedup** — React Query natively coalesces 5 concurrent subscribers to `['wallet', userId]` into ONE network request. All 5 components get the same fresh response. This is not caching; the response is thrown away immediately (`staleTime: 0, gcTime: 0`). It only prevents the *same millisecond* firing the RPC 5 times.
2. **Killing duplicate hooks** — right now `useAgentBalances`, `useAuthoritativeWalletBalance`, `useOpsWallet`, and inline `supabase.rpc('get_user_wallet_view')` calls each own their own query key. Same data, different keys = no dedup. We collapse them to ONE hook with ONE key.
3. **Killing polling** — `refetchInterval: 30_000` on `useAgentBalances` alone is ~2 calls/min/agent × ~1000 active agents × 8hr day = ~960k calls/day. Realtime already invalidates on wallet changes; the poll is redundant.

## Phase 1 — Wallet unification (highest ROI, ship first)

**Single hook:** `useWalletBalance(userId)` in `src/hooks/wallet/useWalletBalance.ts`.

- Reads `get_user_wallet_view` (strict RPC — same source as the ledger).
- Query key: `['wallet', userId]` — one key for the whole app.
- `staleTime: 0`, `gcTime: 0`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, `refetchOnMount: 'always'`, no `refetchInterval`.
- Invalidated by `useWalletRealtime` on `wallets`, `general_ledger`, `wallet_transactions` postgres_changes for that user.
- Returns the exact fields the wallet card and ledger both need: `{ withdrawable, float_balance, advance_balance, pending_holds, total_visible, updated_at }`.

**Deprecate / redirect:**
- `useAgentBalances` → thin wrapper over `useWalletBalance` (keep the commission-netting math, but consume the same underlying query).
- `useAuthoritativeWalletBalance` → already a wrapper over `useOpsWallet`; point both at `useWalletBalance`.
- `useOpsWallet` in `useOpsDataLayer` → same underlying key.
- Grep for direct `supabase.rpc('get_user_wallet_view')` calls in components (wallet card, withdraw dialog, deposit dialog, hero, statement, drawer, statistics) and replace with the hook.

**Result:** every wallet card, dialog, statement, and drawer on a screen shares ONE in-flight request per user. From 5–15 duplicate calls per screen render down to 1. Wallet card ≡ ledger, guaranteed by construction.

## Phase 2 — Global refetch defaults

In `src/App.tsx` (or wherever `QueryClient` is constructed), set default options:

```
defaultOptions: {
  queries: {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  }
}
```

Screens that genuinely need focus-refetch (very few — maybe live dashboards) opt in explicitly. This one change kills a huge tail of "tab focus fires 20 queries" bursts.

## Phase 3 — Profile & role dedup

- `useUserProfile(userId)` — single hook, key `['profile', userId]`. Replaces the ~10 places that inline `supabase.from('profiles').select().eq('id', userId)`.
- `useUserRoles(userId)` — single hook. Roles change rarely; `staleTime: 5 * 60_000` is fine here (roles are not money).
- Batch variant `useProfiles(userIds[])` — one `.in('id', userIds)` request; list pages (agent ops, tenant ops, landlord ops) stop firing N profile queries.

## Phase 4 — Search hardening (platform-wide)

Create `src/hooks/useDebouncedSearch.ts`:
- Min 3 chars (currently many searches fire on 1–2 chars or empty strings).
- 400ms debounce.
- AbortController on each keystroke — cancels prior in-flight request.
- No fetch on empty string, ever.

Apply to: `TenantOpsSearch`, `LandlordOpsDashboard` search, `UserSearchPicker`, agent search, staff search. This alone should kill the 83k landlord searches with 1928ms mean.

## Phase 5 — Dialog data flow

Rule: dialogs receive data via props from the parent that opened them. No re-fetching the same wallet, profile, or row the parent already has. Audit `WithdrawFlow`, `DepositFlow`, `EditUser`, `AssignFloat`, `WithdrawalPayoutCard`, `MerchantFloatRequestsPanel` action dialogs.

## Phase 6 — Instrumentation (so we can see the win)

Extend `src/lib/costMonitor.ts` with a Supabase interceptor:
- Wrap `supabase.rpc` / `.from().select()` to record `{ rpc_or_table, timestamp, screen_route }`.
- Dev-only overlay: press `Ctrl+Shift+D` to see live counts, top offenders, duplicates in the last 60s.
- CFO route `/cfo/performance` reads aggregated counters and shows a "requests-per-screen" leaderboard.

## Phase 7 — Batch RPCs for list pages

Only where a list clearly fires N-per-row today:
- `get_wallet_balances_bulk(user_ids uuid[])` — for ops list views that show a balance column.
- `get_profiles_bulk(user_ids uuid[])` — same.

These are new SECURITY DEFINER RPCs; ops-role gated. Each replaces up to 100 individual round-trips with 1.

## Phase 8 — Lazy load hidden tabs

Screens with tabs (CFO dashboard, More panel, Analytics) — hooks in inactive tabs must not fire. Guard with `enabled: activeTab === 'this'`. Quick pass; ~2h of work.

## Phase 9 — Pagination floor

Any `.select()` that today returns > 100 rows gets an explicit `.range(0, 49)` and a "Load more" button. Withdrawal history, ledger view, landlord directory, user list.

## Rollout order (fastest wins first)

1. **Day 1 (today):** Phase 1 (wallet unification) + Phase 2 (global defaults) + Phase 6 instrumentation overlay. Measurable CPU drop within an hour of deploy.
2. **Day 2:** Phase 4 (search) + Phase 3 (profile hook). Kills the landlord-search CPU and profile-lookup tail.
3. **Day 3:** Phase 5 dialog audit + Phase 8 lazy tabs.
4. **Day 4:** Phase 7 batch RPCs where the instrumentation shows they still matter. Phase 9 pagination.

## Deliverables (per phase, in the closing message)

- Files changed.
- Grep evidence of old duplicate call sites removed.
- Instrumentation numbers from the dev overlay: before vs after per screen.
- Confirmation that wallet card === ledger === strict RPC.

## Explicit non-goals

- No new caches, no localStorage wallet snapshots, no stale-while-revalidate on money data.
- No changes to ledger math or `get_user_wallet_view`.
- No changes to realtime channels beyond invalidation wiring.

Approve and I'll ship Phase 1 + 2 + 6 in the next turn.
