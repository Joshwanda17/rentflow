

# Redesign COO Agent Hub: Remove Inner Sidemenu, Add KPI Cards + Advanced Table

## Current State
The Agent Hub has a two-panel layout: a dark blue left sidebar (`w-[260px]`, lines 217-221) with status filter buttons and KPI summary, and a right panel with a simple agent list. On mobile, the sidebar collapses to horizontal chips.

## What Changes

Remove the inner dark sidemenu entirely. Replace the page with a clean single-column layout:

1. **KPI Row** (top) — 6 metric cards in a responsive grid showing:
   - Total Agents (count)
   - Active Agents (count + percentage)
   - Inactive Agents (count)
   - Pending Agents (count)
   - Total Commission (sum, formatted UGX)
   - Avg Wallet Balance (formatted UGX)

   Use the existing `KPICard` component from `src/components/executive/KPICard.tsx` for visual consistency with other COO dashboard tabs.

2. **Filter/Search Bar** — Below KPIs, a toolbar with:
   - Search input (existing)
   - Status filter dropdown (replaces sidebar buttons): All / Active / Inactive / Pending / Top Performers / At Risk
   - Sort dropdown (existing)
   - Top Performers and At Risk shown as colored badge-style filter chips

3. **Agent Table** — Replace the current list-style layout with a proper `<Table>` using the existing shadcn table components. Columns:
   - Agent Name (with marble avatar + status dot)
   - Phone
   - Territory
   - Tenants (count)
   - Landlords (count)
   - Commission (formatted)
   - Wallet Balance (formatted)
   - Status (badge)
   - Action (chevron → opens existing detail drawer)

   Retains server-side pagination via `get_agents_hub` RPC + "Load more" button.

## Data Integrity
- No data source changes — same `get_agents_hub` RPC, same `classifyAgent` logic, same counts computation
- Status classification logic unchanged (lines 42-49)
- KPI values computed identically from loaded agent data
- Pagination and search debounce preserved exactly

## Files Changed
- `src/components/coo/COOAgentHub.tsx` — full rewrite of the render output; all state/fetch logic stays the same

## Runtime Error
The `useContext` error from `next-themes` is unrelated to this component — it's a theme provider ordering issue. Will investigate and fix silently if possible during implementation.

