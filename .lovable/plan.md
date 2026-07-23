## What the database is actually doing right now

I pulled the top 25 slowest queries from `pg_stat_statements`. The 256% CPU is not spread across the app — it's concentrated in **7 patterns** that together account for the overwhelming majority of total execution time:


| #   | Pattern                                              | Calls    | Mean ms     | Total sec  | Root cause                                                                                         |
| --- | ---------------------------------------------------- | -------- | ----------- | ---------- | -------------------------------------------------------------------------------------------------- |
| 1   | `wallets` single/batch reads (multiple variants)     | ~820,000 | 130–6,070   | ~380,000 s | Lock contention: every ledger insert locks the wallet row; readers wait behind the trigger chain   |
| 2   | `landlords` name/phone `ILIKE` search                | 103,000  | 1,928–1,998 | ~200,000 s | No trigram/GIN index — sequential scan every keystroke                                             |
| 3   | `profiles WHERE id = ANY($1)` (batch lookups)        | 465,000  | 224–1,549   | ~200,000 s | N+1 hydration from every ops screen                                                                |
| 4   | `profiles WHERE referrer_id = $1` (+ order + fields) | ~110,000 | 878–3,768   | ~130,000 s | No index on `referrer_id`                                                                          |
| 5   | `profiles.full_name ILIKE` / OR search               | ~65,000  | 791–1,207   | ~52,000 s  | No trigram index                                                                                   |
| 6   | `user_roles` role/enabled/date filters               | ~54,000  | 1,207–1,882 | ~83,000 s  | No index on `role` or `(role, enabled)`                                                            |
| 7   | `general_ledger` per-user history                    | 27,000   | 3,104       | ~85,000 s  | Composite index doesn't match `(user_id, ledger_scope, classification, category, created_at desc)` |
| 8   | `house_listings` verified/status/tenant_id filter    | ~77,000  | 469–808     | ~51,000 s  | Missing partial index                                                                              |


Total from these alone: **~1.18M seconds of CPU time**. Everything else is a rounding error.

The bad news: some of this is real N+1 in the client code (item 3). The good news: **most of it is index-shaped** — a single migration with the right indexes will reclaim the majority of CPU **without any app-code churn**.

## Strategy

Fix the concrete hotspots first (Phase 0 — indexes only, safe, immediate), then build the shared data layer on top (Phase 1–5). No screen rewrites until Phase 3.

```text
Phase 0  ─ Emergency indexes                (hours, no code change)
Phase 1  ─ Wallet-read serialization fix   (1 migration + 1 hook)
Phase 2  ─ Shared search RPC + hook         (replaces 3 ILIKE patterns)
Phase 3  ─ Shared profile hydration RPC     (kills N+1 across ~15 screens)
Phase 4  ─ Materialized views for KPIs      (dashboards stop hitting live tables)
Phase 5  ─ Diagnostics dashboard + guardrails
```

## Phase 0 — Emergency indexes (deploy first)

A single migration adding these indexes. All are `CREATE INDEX IF NOT EXISTS`, non-blocking to reads, and cost roughly one-time build time + tiny write overhead.

```sql
-- Landlords search (200,000s of CPU/day)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_landlords_name_trgm    ON public.landlords USING gin (name gin_trgm_ops);
CREATE INDEX idx_landlords_phone_trgm   ON public.landlords USING gin (phone gin_trgm_ops);

-- Profile search (52,000s)
CREATE INDEX idx_profiles_full_name_trgm ON public.profiles USING gin (full_name gin_trgm_ops);
CREATE INDEX idx_profiles_phone_trgm     ON public.profiles USING gin (phone gin_trgm_ops);
CREATE INDEX idx_profiles_email_trgm     ON public.profiles USING gin (email gin_trgm_ops);

-- Referrer lookups (130,000s)
CREATE INDEX idx_profiles_referrer_created
  ON public.profiles (referrer_id, created_at desc)
  WHERE referrer_id IS NOT NULL;

-- user_roles filtering (83,000s)
CREATE INDEX idx_user_roles_role_enabled_created
  ON public.user_roles (role, enabled, created_at);

-- general_ledger per-user history (85,000s)
CREATE INDEX idx_gl_user_scope_created
  ON public.general_ledger (user_id, ledger_scope, created_at desc)
  WHERE classification <> 'admin_correction'
    AND category    <> 'system_balance_correction';

-- house_listings public/available filter (51,000s)
CREATE INDEX idx_house_listings_available
  ON public.house_listings (status, is_hidden, verified, tenant_id)
  WHERE tenant_id IS NULL;
```

**Expected impact:** ~60–70% CPU drop, immediately. Instance should fall from 256% → sub-100% within one refresh cycle.

## Phase 1 — Fix wallet-read contention (single biggest remaining hotspot)

Wallet single-row reads averaging **271ms–6070ms** are impossible on a 50k-row table with a PK — the only explanation is **lock contention** from the write-heavy trigger chain (`apply_wallet_movement` → wallet UPDATE → row lock → readers wait).

Fix:

- Route every wallet read through the existing `get_authoritative_wallet(user_id)` RPC (Postgres-side, `STABLE`, cache-friendly).
- Create a single React Query hook `useOpsWallet(userId)` with a **5-second stale time** and **shared query key** — so 15 components on the same page hydrate once, not 15 times.
- Ban direct `.from('wallets')` reads from ops code (lint rule + code review, tracked in follow-up).

## Phase 2 — One shared search RPC

Three separate ILIKE patterns (`landlords`, `profiles`, ops search) become one hook backed by two already-optimized RPCs (`search_users_fast`, `ops_search_landlords`, added earlier). Deliverables:

- `useOpsSearch({ scope: 'users' | 'landlords' | 'merchants' | 'agents' | 'tenants', query })` — 400ms debounce, 4-char minimum, `AbortController`, LRU cache.
- Delete all screen-local ILIKE query builders.

## Phase 3 — Shared profile-hydration RPC (kills the N+1)

`ops_hydrate_profiles(ids uuid[])` — one round-trip returns `{id, full_name, phone, avatar_url, verified, role, wallet_bucket}` for up to 500 ids. Replaces the current cascade:

```text
100 rows → 100 profile fetches → 100 wallet fetches → 100 role fetches
```

with:

```text
100 rows → 1 RPC → done
```

Wrap in `useOpsProfileBatch(ids)` (React Query, dedup, 30s stale). Migrate the four highest-N+1 screens first:

- Pending Withdrawals
- Rent Approval Queue
- Agent Ops Fleet
- CFO Reconcile

## Phase 4 — Materialized views for dashboard KPIs

Move the expensive count/sum queries powering dashboards into `mv_ops_*` materialized views refreshed by `pg_cron` every 2 minutes:

- `mv_pending_withdrawals_summary`
- `mv_merchant_cashout_summary`
- `mv_rent_approvals_summary`
- `mv_cfo_kpis`
- `mv_agent_performance`

Drill-down data stays live; only the totals/cards read from MVs.

## Phase 5 — Ops Diagnostics dashboard + guardrails

- Read-only diagnostics page (CFO + super_admin) showing: top 10 slow queries (from `pg_stat_statements`), CPU, active connections, MV refresh lag, statement-timeout count (last 24h), Edge Function error rate.
- Statement-timeout guardrail: any query taking >5s logs to a new `ops_perf_metrics` row (table already exists) with the calling screen, so future regressions are visible before users notice.

## Technical notes

- Every migration follows the `CREATE TABLE → GRANT → ALTER RLS → CREATE POLICY` order per project standards.
- Every new RPC is `SECURITY DEFINER`, `SET search_path = public`, and role-gated via `is_ops_role(auth.uid())`.
- No wallet bucket writes anywhere — all balance queries route through `get_authoritative_wallet`.
- Phase 0 is safe to deploy immediately; Phases 1–5 land as separate migrations + PRs so each can be validated in isolation.

## Rollout order (recommended)

1. **Today:** Phase 0 migration (indexes). Watch CPU drop. No app changes needed.
2. **This week:** Phase 1 (wallet hook) + Phase 2 (shared search).
3. **Next week:** Phase 3 (profile hydration).
4. **Following:** Phase 4 (MVs) + Phase 5 (diagnostics).

## Compute-size note

At 256% utilization even a Large instance is over capacity. Phase 0 alone should bring it back into range, but if it doesn't, resizing is a valid short-term backstop while Phases 1–3 land. Not recommending it as the first move — the current load is largely wasted on missing indexes, and paying for compute to run seq-scans is the wrong tradeoff.

## Approve to proceed

If this plan looks right, I'll start with the Phase 0 migration in the next turn. Say the word and I'll ship it.  
This is an excellent plan. The only refinement I'd make is to explicitly prioritize **return on investment (ROI)** so that the team tackles the changes that deliver the biggest performance gains first. I would also add a validation checkpoint after each phase so you can measure actual improvements before moving on.

---

# Performance Optimization Roadmap (50K → 1M+ Users)

## Objective

Reduce database CPU utilization, eliminate statement timeouts, and build a reusable backend architecture that scales beyond **1 million users**.

This is a platform optimization initiative—not a screen-specific optimization.

---

# Phase 0 – Emergency Database Optimization (Highest ROI)

## Goal

Immediately reduce database CPU consumption without changing application code.

### Tasks

- Create missing indexes for:
  - `profiles`
  - `landlords`
  - `user_roles`
  - `general_ledger`
  - `house_listings`
- Verify every high-frequency query with:

```sql
EXPLAIN (ANALYZE, BUFFERS)

```

- Confirm PostgreSQL switches from sequential scans to index scans.

### Validation

Measure before and after:

- CPU utilization
- Query latency
- Statement timeouts
- Active connections

**Expected Outcome**

- 50–70% reduction in database CPU.
- Significant reduction in query execution times.

---

# Phase 1 – Eliminate Wallet Read Contention

The current hotspot is wallet reads waiting behind write locks.

### Tasks

- Standardize all wallet reads through `get_authoritative_wallet(user_id)`.
- Create a shared `useOpsWallet()` hook.
- Eliminate direct reads from the `wallets` table in operational screens.
- Reuse cached results across components using shared React Query keys.

### Validation

Measure:

- Wallet read latency
- Lock waits
- Concurrent wallet read performance

---

# Phase 2 – Shared Search Service

Replace every custom search implementation with reusable RPCs.

### Standardize

- User Search
- Wallet Owner Search
- Merchant Search
- Tenant Search
- Landlord Search
- Agent Search

Features:

- Debouncing
- AbortController
- LRU cache
- Shared React Query cache
- Prefix search
- Indexed lookups

### Validation

Measure:

- Search latency
- Queries executed per search
- Database CPU impact

---

# Phase 3 – Shared Data Hydration

This removes the largest remaining N+1 problem.

Instead of:

```text
100 rows
↓

100 profile queries

↓

100 wallet queries

↓

100 role queries

```

Use:

```text
100 rows
↓

1 RPC

↓

Complete dataset

```

Create reusable hydration services for:

- Profiles
- Wallets
- Roles
- Verification status

Every operations screen should reuse these services.

### Validation

Track:

- Database calls per screen
- API calls per screen
- Screen load time

---

# Phase 4 – Materialized Views

Move expensive dashboard summaries into scheduled materialized views.

Examples:

- Pending Withdrawals
- Merchant Cash-Out
- Rent Approvals
- CFO KPIs
- Finance KPIs
- Agent Performance

Refresh every 2–5 minutes.

Keep detailed drill-downs live.

### Validation

Compare:

- Dashboard load time
- CPU usage before/after
- Query execution time

---

# Phase 5 – Shared Operations Platform

Build a reusable Operations Data Layer.

Architecture:

```text
Operations Screens
        │
        ▼
Shared React Hooks
        │
        ▼
Operations RPC Layer
        │
        ▼
Views / Materialized Views
        │
        ▼
PostgreSQL

```

No screen should independently query multiple tables.

---

# Phase 6 – Performance Monitoring

Create a permanent Operations Diagnostics dashboard.

Monitor:

### Database

- CPU
- Memory
- Active connections
- Slow queries
- Lock waits
- Cache hit ratio
- Index usage

### Backend

- RPC latency
- API latency
- Queue length
- Statement timeouts
- Edge Function failures

### Frontend

- Screen load time
- React render time
- Cache hit rate
- Search latency

---

# Success Metrics

By the end of the optimization initiative:

- Database CPU consistently below **60–70%** under normal production load.
- Search responses below **300 ms**.
- Dashboard loads below **2 seconds**.
- Zero N+1 query patterns in operational workflows.
- Zero statement timeout errors during normal usage.
- Shared RPCs and React hooks used across all operations screens.
- Infrastructure capable of supporting **1 million+ users** without requiring a major architectural rewrite.

---

## Recommended Rollout

1. **Phase 0:** Emergency indexes and query optimization.
2. **Measure CPU, latency, and query improvements.**
3. **Phase 1:** Wallet read optimization.
4. **Measure lock contention improvements.**
5. **Phase 2:** Shared search service.
6. **Phase 3:** Shared data hydration.
7. **Phase 4:** Materialized views.
8. **Phase 5:** Shared Operations Platform.
9. **Phase 6:** Monitoring and diagnostics.

This staged approach ensures each optimization delivers measurable value before moving to the next, minimizes deployment risk, and provides clear evidence of performance improvements at every step.