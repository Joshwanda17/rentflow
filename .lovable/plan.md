

## Problem
Top stats on Agent Operations look static because the queries are capped:
- `agent_earnings` → `.limit(200)` → totalEarnings & uniqueAgents wrong
- `agent_commission_payouts` → `.limit(100)` → totalCommissions wrong
- Agents count uses only agents that appear in the last 200 earnings rows, missing all other agents

## Fix
Replace the row-fetched aggregations with proper server-side aggregates so the three KPIs (Agents, Earnings, Commissions) reflect real, full totals and refresh live.

### Changes in `src/components/executive/AgentOpsDashboard.tsx`
1. Add a new `useQuery(['agent-ops-kpis'])` that runs three parallel server-side counts/sums:
   - **Agents**: `count` of `user_roles` where `role = 'agent'` (head + exact count).
   - **Earnings**: `sum(amount)` from `agent_earnings` via a lightweight RPC if available, else paginated reduce. Prefer existing RPC pattern (see `get_financial_ops_pulse`). If no RPC exists, fall back to `select amount` with no limit and reduce — acceptable for current scale, but we will add a tiny SQL helper RPC `get_agent_ops_kpis()` returning `{ agents, earnings_total, commissions_total }` to stay aligned with the high-scale ops automation memory.
   - **Commissions**: `sum(amount)` from `agent_commission_payouts` (status filter: include all paid + pending? — default to all, matches current behavior).
3. Wire `KPICard` values to the new query (`kpis.agents`, `kpis.earnings_total`, `kpis.commissions_total`) and use that query's `isLoading` for the skeleton.
4. Keep the existing `earnings`/`commissions` row queries (still used for the Earnings table sub-view) but no longer use them for the KPIs.
5. Set `staleTime: 60_000` and add a manual refetch on mount so figures stay current without hammering DB.

### New RPC (migration)
Create `public.get_agent_ops_kpis()` returning JSON:
```
{ agents: bigint, earnings_total: numeric, commissions_total: numeric }
```
- `SECURITY DEFINER`, `SET search_path = public`.
- Restricted to authenticated roles with staff/exec permissions (mirrors existing exec RPCs).

## Out of scope
- Layout, icons, navigation grid — untouched.
- Sub-views (Earnings table, Pipeline, etc.) — untouched.

## Acceptance
- Opening Agent Operations shows real totals (not "43…" capped from 200 rows).
- Agents count equals total agents on the platform, not just recent earners.
- Numbers update on refetch and reflect new earnings/commissions immediately.

