
# Agent Ops Dashboard — Full Redesign

Rebuild `AgentOpsDashboard` from an advance-heavy grid into a comprehensive operations hub covering every agent activity: onboarding, listings, rent collections, verifications, allocations, float, commissions, tenant/landlord networks, and advances.

## 1. Navigation shell — new sidebar

Replace the current tile grid + `AgentOpsBottomNav` with a `shadcn` `Sidebar` (collapsible="icon"), always visible on ≥`sm`. Bottom nav stays on mobile but re-mapped.

Sidebar groups (order top→bottom):

- **Overview** — Dashboard home (KPIs + charts), Daily Brief, Alerts
- **Agents** — Directory, Lifecycle & Tiers, Leaderboard, Sub-Agents, Service Centres, Tenant → Sub-Agent, Bulk Ops, Feature Flags
- **Field Operations** — Pipeline, Rent Capacity, Daily Rent Collections, Listing Campaign, Trust Capture, Tasks, Escalations, Connect
- **Finance** — Agent Balances, Float Payouts, Earnings, Transfers, Locked Transfers, Allocations & Repayment, Lending Agents
- **Advances** *(kept as-is)* — Requests, Active, Potential, Limits, Repayments, Repayment Monitor, Analytics
- **Reports** — Performance Report, Allocation Report, Daily Overview PDF

Each group uses `SidebarGroup` + `SidebarMenuButton` with active-route highlight via `activeView` state. A pending-count badge stays on "Requests". Collapsed state shows icons only.

## 2. Dashboard home — comprehensive stats & charts

New `AgentOpsOverview` component replaces the current `AgentMonthlyKpis + AdvanceAnalyticsPanel + AgentOpsHomeView + AgentAdvanceRepaymentMonitor` stack. Layout:

**Row A — Headline KPI strip (8 cards, 2×4 on desktop, 2×2 scrollable on mobile)**
- Total Agents (all-time) — from `get_agent_ops_kpis`
- Active Agents (range) — unique posting agents
- New Agents (range) — from `user_roles`
- Rent Requests (range) — count + amount
- Verified Houses (range) — from `house_listings`
- Rent Collections Today — from `agent_collections`
- Commission Paid (range) — wallet-scope ledger
- Outstanding Advances — sum of `agent_advances.outstanding_balance`

Each card: sparkline, %Δ vs prior period, click → drill-down.

**Row B — Charts (2 columns)**
- Agent Activity Trend — stacked area: new agents / active agents / rent requests over range
- Commission vs Collections — dual-line: commission earned vs UGX collected (from `agent_collections`)

**Row C — Charts (3 columns)**
- Listings funnel — bar: listed → verified → tenant placed (from `house_listings`)
- Rent Pipeline — stacked bar by stage from `get_agent_ops_pipeline_counts` (fallback to `rent_requests.status` counts)
- Advance Health — donut: on-schedule / ahead / behind (from `agent_advances`)

**Row D — Operational tables (tabs)**
- Top Agents (leaderboard preview, top 10 by commission in range)
- Recent Rent Requests (latest 10)
- Recent Verifications (houses + landlords)
- At-Risk Agents (behind on advance / no collection today)

Date-range switcher (24H / 7D / 1M / Custom) drives everything. Realtime subscription on `general_ledger`, `rent_requests`, `agent_collections`, `house_listings`, `user_roles`.

## 3. Data plumbing

- Add one new RPC `get_agent_ops_overview(p_range_start, p_range_end)` returning a single JSON payload for Row A + trend series, so the overview loads in ≤2 round-trips (overview RPC + charts sub-queries in parallel). Falls back to existing queries if the RPC isn't present yet.
- Reuse existing hooks/RPCs where already good: `get_agent_ops_kpis`, `get_agent_ops_monthly_kpis`, `get_agent_advance_repayment_monitor`, `get_agent_leaderboard_stats`, `get_agent_ops_totals`.

## 4. Files touched

- `src/components/executive/AgentOpsDashboard.tsx` — shell rewrite (sidebar + main content, keeps all existing sub-views wired through `activeView`).
- New `src/components/executive/agent-ops-v2/AgentOpsSidebar.tsx` — sidebar nav.
- New `src/components/executive/agent-ops-v2/AgentOpsOverview.tsx` — Row A–D overview.
- New `src/components/executive/agent-ops-v2/charts/` — `AgentActivityTrendChart`, `CommissionVsCollectionsChart`, `ListingsFunnelChart`, `RentPipelineChart`, `AdvanceHealthDonut`, `TopAgentsPreview`, `AtRiskAgentsTable`.
- Update `AgentOpsBottomNav` labels to match new groups (Overview / Agents / Field / Finance / More).
- New DB migration: `get_agent_ops_overview` RPC (SECURITY DEFINER, ops-role gate, `search_path=public`).

## 5. What stays

- Every existing sub-view (Directory, Pipeline, Advances panels, Balances, etc.) is preserved and reachable from the sidebar.
- The Advances group is untouched functionally.
- Existing routes, RLS, ledger reads unchanged.

## 6. Rollout

Ship in one PR. Sidebar visible ≥`sm`; mobile keeps bottom-nav + top-of-page range picker. No behavior change for sub-views.
