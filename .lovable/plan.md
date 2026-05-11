## Goal

Refactor the Tenant Ops Dashboard so its overview matches the uploaded "Daily Collection Monitoring Dashboard" mockup (header, 5 KPI cards, tenant tracker table, agent summary, donut, monthly trend, top/bottom agents).

**No DB changes.** No new tables, columns, RPCs, or migrations. Pure UI/composition refactor.

## Key insight

The shared component `src/components/shared/DailyCollectionMonitoringDashboard.tsx` already implements the exact mockup (all 5 KPI cards, the tracker table with #/Date/Agent/Tenant/Property/Expected/Collected/Balance/Status/Method/Remarks, the Agent Daily Summary, the Collection Overview donut, the Monthly Collection Trend line chart, and the Top/Bottom Agents cards).

It is currently buried inside Tenant Ops as a sub-view (`activeView === 'daily-collections'`) reachable only by clicking a small nav card. We just need to promote it to be the headline of the overview.

## Changes

### `src/components/executive/TenantOpsDashboard.tsx` (only file edited)

1. **Render `<DailyCollectionMonitoringDashboard mode="editable" title="Daily Collection Monitoring" />` at the top of the `activeView === 'overview'` block**, immediately under the existing AnimatePresence wrapper, so it becomes the first thing the user sees — exactly like the mockup.

2. **Demote the existing 4-card mini KPI strip** (Pending / Funded / Repaying / Defaulted) into a smaller secondary "Pipeline status" strip placed *below* the Daily Collection dashboard, so pipeline counts stay accessible but stop competing for attention.

3. **Keep the Print Report / Extract / date-range toolbar** but move it into a collapsible "Reports & Exports" section below the dashboard (still on overview, just no longer the visual headline).

4. **Keep the navigation card grid** (Pipeline, Tenant Behavior, Approval History, All Requests, Link Agent, Transfer Audit, Collect Rent, Search by Agent, Review Registration, Agent Advances, Agent Allocations) — but:
   - Remove the now-redundant "Daily Collections" nav card from `navCards` (since it's the headline now).
   - Render the grid under a "Tenant Ops Tools" subheading so it's clearly secondary navigation, not the primary content.

5. **Keep the `TenantOverviewList`** at the bottom of overview (unchanged).

6. **Sub-views unchanged.** All other `activeView` branches (pipeline, behavior, history, all-requests, link-agent, transfer-audit, collect-rent, agent-tenants, registration-review, advance-requests, agent-allocations, tenant-detail) keep working exactly as today, with the same Back-to-Overview affordance. The `'daily-collections'` case can be removed from the switch since it's no longer reachable, or left as a no-op redirect.

### Resulting overview order (top → bottom)

```
[ Daily Collection Monitoring Dashboard ]   ← matches mockup
   • Range tabs (Today / Weekly / Monthly) + day picker
   • 5 KPI cards (Onboarded / Paid For / Today UGX / This Month / All Time)
   • Filters (Agent, Property)
   • Tenant Daily Collection Tracker table
   • Agent Daily Collection Summary  +  Collection Overview donut
   • Monthly Collection Trend  +  Top & Bottom Agents

[ Pipeline status strip ]  Pending · Funded · Repaying · Defaulted (clickable filters)

[ Reports & Exports ]  date pickers + Extract menu + Print Report

[ Tenant Ops Tools ]  navigation card grid

[ Tenant Overview List ]  (existing list, unchanged)
```

## Out of scope

- No database migrations, schema edits, or new tables/columns.
- No changes to `DailyCollectionMonitoringDashboard.tsx` internals (it already matches the mockup).
- No changes to sub-view components (RentPipelineQueue, TenantBehaviorDashboard, etc.).
- COO Tenant Ops Report page (`src/pages/coo/reports/TenantOpsReport.tsx`) is a separate report and stays untouched unless you want it included.

## Risks / notes

- The shared component already does its own data fetching from `rent_requests` + `agent_collections` + `general_ledger`, so promoting it to the overview adds queries on first load. They are cached via React Query and gated by date range, so impact is bounded.
- The mockup's "+5 vs yesterday" delta lines and exact color palette (blue/green/cyan/amber/purple icons) are already implemented inside the shared component.
