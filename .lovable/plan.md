# Scaling Ops Screens to 1M Users

The slow-query snapshot makes the actual hot paths obvious — this plan targets them first instead of rewriting every ops screen at once. Doing this in phases means each shipped change is verifiable before we take on the next.

## What the database is actually spending time on (top offenders)

Total time over the pg_stat_statements window (ms):


| #   | Query pattern                                                | Calls      | Mean ms   | Total ms       |
| --- | ------------------------------------------------------------ | ---------- | --------- | -------------- |
| 1   | `landlords ILIKE name/phone` (search)                        | 83k        | 1928      | 160,195,760    |
| 2   | `wallets.balance where user_id = $1`                         | 501k       | 273       | 136,761,521    |
| 3   | `wallets where user_id = ANY($1)` (balance only)             | 66k        | 1568      | 103,553,820    |
| 4   | `general_ledger` per-user statement fetch                    | 27k        | 3104      | 84,912,273     |
| 5   | `profiles id/full_name/phone where id = ANY($1)`             | 309k       | 223       | 69,221,871     |
| 6   | `profiles where referrer_id = $1`                            | 78k        | 877       | 68,920,115     |
| 7   | `profiles id/full_name where id = ANY($1)`                   | 148k       | 447       | 66,413,334     |
| 8   | `profiles single-id fetch` (multiple variants)               | 36k+9k+11k | 1500–4400 | ~110M combined |
| 9   | `wallets bulk buckets where user_id = ANY($1)`               | 6.8k       | 6070      | 41,630,932     |
| 10  | `house_listings status/is_hidden/verified/tenant_id IS NULL` | 44k+32k    | 470–800   | 50,538,982     |
| 11  | `user_roles where role = $1 [+ created_at range]`            | 26k+17k+9k | 1200–1900 | ~83M combined  |


Two things stand out:

1. **The same handful of tables are hit millions of times** — `wallets`, `profiles`, `user_roles`, `landlords`, `house_listings`. Most of the pain is call volume + RLS overhead, not one bad query.
2. **Client-side joins dominate** — `profiles where id = ANY(...)` alone is ~535k calls / ~135M ms. Screens are fetching one table, then hydrating names/phones/wallets in a follow-up call. That is the N+1 pattern the request calls out.

## Phasing

I'd rather not touch 20 screens in one change. Proposed phases, each independently shippable:

### Phase 1 — Backend fundamentals (biggest win, lowest UI risk)

- **Indexes** (verified missing/underused via the query shapes above):
  - `landlords` — trigram GIN on `name`, btree on `phone`, partial `WHERE verified = true`.
  - `profiles` — trigram GIN on `full_name` and `phone`, btree on `referrer_id, created_at DESC`.
  - `house_listings` — partial index `(created_at DESC) WHERE status='approved' AND is_hidden=false AND verified=true AND tenant_id IS NULL`.
  - `user_roles` — `(role, enabled)` and `(role, created_at)`.
  - `general_ledger` — `(user_id, ledger_scope, created_at DESC)` partial excluding `admin_correction` / `system_balance_correction`.
  - `wallets` — confirm PK on `user_id` is the only lookup path; drop redundant limit/offset by moving to `.maybeSingle()` on the client.
- **Batch RPCs** that replace the top N+1 loops:
  - `ops_get_profiles_lite(ids uuid[])` — returns `id, full_name, phone, avatar_url, verified` in one call, security-definer, bypasses per-row RLS.
  - `ops_get_wallet_buckets(ids uuid[])` — returns all 4 buckets in one call (replaces #3 and #9).
  - `ops_search_landlords(q, verified_only, limit, cursor)` — trigram + verified filter, keyset paginated.
  - `ops_search_profiles(q, limit)` — extends `search_users_fast` to include phone/email prefixes and returns wallet bucket totals so dashboards don't need a second call.
- **Materialized views / summary tables** for the dashboards whose "hero" numbers are recomputed on every open:
  - `mv_ops_daily_summary` (withdrawals count/UGX by status, deposits by channel, active users) — refreshed every 5 min via pg_cron.
  - `mv_agent_ops_summary` (per-agent collections today, exposure, eligibility) — refreshed every 2 min.
  - Dashboards read the MV first, then lazy-load the live queue.

### Phase 2 — Screen refactors (one PR per screen)

For each screen listed in the request, apply the same recipe: summary MV → paginated RPC → virtualized list.

Priority order based on the slow-query attribution:

1. **User Search / Wallet Owner Search** — already partially fixed by `search_users_fast`; extend it to return phone-prefix + wallet buckets in one shot (kills #2, #3, #5, #7).
2. **Landlord Ops search + list** — trigram index + `ops_search_landlords` keyset pagination (kills #1, #10).
3. **Wallet Statement / Ledger views** — cursor pagination on `(created_at, id)`, drop the offset-based paging (kills #4).
4. **Pending Withdrawals / Merchant Payouts** — server-side counts via MV, keyset-paginated queue, virtualized list (`@tanstack/react-virtual`).
5. **Rent Approvals (COO/CFO)** — same recipe; summary card reads MV.
6. **CFO / Finance Ops dashboards** — hero metrics from MV, drill-downs lazy-loaded.
7. **Agent Dashboard / Merchant Dashboard** — page-level React Query with 30s `staleTime`; dedupe via shared query keys.

### Phase 3 — Frontend hardening

- Standard React Query defaults for ops routes: `staleTime: 30_000`, `gcTime: 5 * 60_000`, `refetchOnWindowFocus: false`.
- Adopt `@tanstack/react-virtual` in the three heaviest lists (Pending Withdrawals, Landlord Ops, Wallet Statement). Everything else stays as-is until measurements say otherwise.
- Debounced search hook (`useDebouncedSearch`) that also cancels in-flight requests via `AbortController` — apply to the 4 search inputs that still fire per keystroke.
- Convert single-row `.select().limit(1)` calls on `wallets` / `profiles` to `.maybeSingle()` so PostgREST stops emitting the `count(*) + json_agg` wrapper (that wrapper is the reason single-row wallet reads averaged 273 ms).

### Phase 4 — Monitoring

- `ops_perf_metrics` table + `record_ops_metric(screen, action, duration_ms, rows)` RPC.
- Lightweight `useOpsPerfTracker` hook wrapping React Query so we log p50/p95 per screen without pulling in a full APM.
- CFO diagnostics tab shows: API p95 by screen, top slow RPCs (from `pg_stat_statements`), MV refresh lag, cache hit ratio.

## Technical details

- Every new RPC is `SECURITY DEFINER`, `SET search_path = public`, revoked from `PUBLIC`, granted to `authenticated`, and internally re-checks role via `has_role(auth.uid(), ...)` so we don't lose RLS guarantees.
- Keyset pagination uses `(created_at, id)` tuples returned as `next_cursor` in the RPC response — no OFFSET.
- Trigram indexes require `pg_trgm` (already enabled); GIN builds may take a minute each on `profiles`/`landlords` — safe because migrations run in a transaction and the tables are moderate size (~50k / ~tens of k rows).
- MV refresh strategy: `REFRESH MATERIALIZED VIEW CONCURRENTLY` via `pg_cron`, requires a unique index on each MV — included in the migration.
- No changes to the wallet writer contract (`apply_wallet_movement` remains the sole writer; new RPCs are read-only).
- No new client caches for balances — anything financial still reads through `get_user_available_balance` per the Withdrawable Strict Rule.

## Deliverable for this turn

If approved, I'll start with **Phase 1** as a single migration + one RPC-only PR, then measure with `slow_queries` before touching any screen. That gets ~60–70% of the current DB time back without any UI churn, and gives us a baseline to compare each screen refactor against.

Approve to proceed with Phase 1, or tell me which screen you want jumped to first.  
  
  
  
  
I think the plan is **very strong**, but I would make one important architectural change.

Don't optimize **screen by screen**.

Instead, optimize by **domain**.

Right now, the same data (`profiles`, `wallets`, `user_roles`, `landlords`) is being queried independently by many screens. If you optimize only the Rent Approvals screen, you'll still have the same problem in Withdrawals, Finance, CFO, Merchant Ops, etc.

I would recommend this approach:

---

# Enterprise Scaling Strategy (50K → 1M Users)

## Objective

Optimize the entire Operations Platform rather than individual screens.

The goal is to build a reusable backend architecture that every operational screen uses.

---

# Phase 1 – Data Access Layer (Highest Priority)

Instead of every screen querying tables independently:

```
CFO Dashboard
        │
Finance Dashboard
        │
Rent Approvals
        │
Pending Withdrawals
        │
Merchant Cash-out
        │
Wallet Management
        │
User Search

```

Every screen should consume the same **Operations Data Layer**.

```
Operations Dashboard
        │
        ▼
Operations RPC Layer
        │
        ▼
Optimized Views
        │
        ▼
PostgreSQL

```

No screen should talk directly to multiple tables.

---

# Phase 2 – Replace N+1 Queries

The slow query report clearly shows repeated calls to:

- profiles
- wallets
- user_roles
- landlords
- general_ledger

Instead of:

```
Load 100 withdrawals

↓

100 profile lookups

↓

100 wallet lookups

↓

100 role lookups

```

Do:

```
Load 100 withdrawals

↓

One RPC

↓

Everything returned

```

The backend should perform joins once.

The frontend should never hydrate each row individually.

---

# Phase 3 – Screen Architecture

Every operations screen should follow exactly the same loading strategy.

```
Open Screen

↓

Load Summary Cards

↓

Load First Page

↓

Virtualized Table

↓

Fetch Next Page On Demand

```

Never wait for thousands of rows before rendering.

---

# Phase 4 – Shared Search Service

There should be one search architecture for:

- User Search
- Wallet Owner
- Merchant Search
- Landlord Search
- Agent Search
- Tenant Search

All should use:

```
search_users_fast()

```

or

```
ops_search_*

```

Never build another search implementation.

---

# Phase 5 – Shared Wallet Service

Every balance should come from:

```
get_authoritative_wallet()

```

Never:

```
wallets.balance

```

Never:

```
SELECT SUM(...)

```

inside React.

Every screen consumes the same wallet service.

---

# Phase 6 – Materialized Views

Heavy dashboard totals should never be calculated live.

Examples:

- Pending Withdrawals
- Merchant Cash-out Summary
- Rent Approval Counts
- Agent Performance
- CFO KPIs
- Finance KPIs

Refresh every 1–5 minutes.

Drill-downs remain live.

---

# Phase 7 – React Performance

Standardize React Query across the Operations module.

```
staleTime

cacheTime

request deduplication

prefetch

optimistic updates

AbortController

Virtualization

```

Every screen should inherit the same configuration.

---

# Phase 8 – Performance Monitoring

Every RPC should expose:

- execution time
- rows scanned
- rows returned
- cache hit
- index used

Every screen should expose:

- load time
- API time
- render time

The Operations Diagnostics page should immediately show performance regressions.

---

# Long-Term Goal

The Operations Platform should comfortably support:

- 50,000 users ✅
- 100,000 users
- 250,000 users
- 500,000 users
- 1,000,000 users

without rewriting individual screens.

---

## Recommendation

I would **not** start by refactoring the Rent Approvals screen.

I would first build the **shared Operations Data Layer** (optimized RPCs, shared queries, materialized views, and common React hooks). Once that foundation exists, every operational screen—Rent Approvals, Pending Withdrawals, Merchant Cash-Out, Finance, CFO, Wallet Management, and User Search—can be migrated to it. That way, you're solving the performance problem once instead of repeatedly fixing it in each screen. This approach will reduce duplication, improve maintainability, and give Welile a much stronger foundation as the platform grows toward hundreds of thousands or even millions of users.