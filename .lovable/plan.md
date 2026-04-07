

# Rent Collection Visibility & Agent Performance Ranking

## Overview
Build two new UI components that give the CFO real-time visibility into all rent collections and rank agents/managers by collection performance. No new database tables needed — all data already exists in `subscription_charge_logs`, `general_ledger`, `rent_requests`, and `audit_logs`.

## Data Sources (Already Exist)

| Data Point | Source |
|---|---|
| Daily auto-charges (tenant + agent fallback) | `subscription_charge_logs` |
| Manual collections | `general_ledger` where `category = 'rent_repayment'` |
| Agent-tenant-property mapping | `rent_requests` (has `agent_id`, `tenant_id`, `landlord_id`) |
| Who collected manually | `audit_logs` where `action_type = 'manual_rent_collection'` |
| Agent names, manager hierarchy | `profiles`, `user_roles` |

## Changes

### 1. New Component: CFO Rent Collections Feed
**File**: `src/components/cfo/RentCollectionsFeed.tsx`

A real-time feed of all rent collections visible to the CFO:
- Queries `subscription_charge_logs` joined with `subscription_charges` (for `agent_id`, `tenant_id`, `rent_request_id`) and `rent_requests` (for `landlord_id`)
- Also queries `general_ledger` entries with `category = 'rent_repayment'` for manual collections
- Displays: Agent name, Tenant name, Amount, Property/Landlord, Date/Time, Collection method (auto/manual), Status (success/partial/failed)
- Filterable by: date range, agent, status
- Summary cards: Total collected today, Total collected this month, Auto vs Manual ratio

### 2. New Component: Agent Performance Rankings
**File**: `src/components/cfo/AgentPerformanceRankings.tsx`

Rankings based on aggregated collection data:
- **Agent Ranking**: Total collected, collection count, collection rate (amount_repaid / total_repayment across their rent_requests), average timeliness
- **Manager Ranking**: Aggregated performance of agents under them (via `rent_requests.agent_id` → agent's manager from reporting structure)
- Period selector: This week, This month, All time
- Visual: Ranked list with position medals (🥇🥈🥉), progress bars for collection rate, trend arrows
- Each agent shows: rank, total collected, # of active tenants, collection efficiency %

### 3. Add to CFO Dashboard Sidebar
**File**: `src/components/layout/executiveSidebarConfig.ts`

Add two items under the Finance section:
- `{ label: 'Rent Collections', icon: Receipt, id: 'rent-collections' }`
- `{ label: 'Agent Rankings', icon: TrendingUp, id: 'agent-rankings' }`

### 4. Wire Up in CFO Dashboards
**File**: `src/pages/cfo/Dashboard.tsx`

Add cases:
- `'rent-collections'` → `<RentCollectionsFeed />`
- `'agent-rankings'` → `<AgentPerformanceRankings />`

Also add `<AgentPerformanceRankings compact />` to the default overview tab.

**File**: `src/pages/CFODashboard.tsx`

Add corresponding tabs to the legacy dashboard.

### 5. Agent Self-View (Optional — Agent Ops Dashboard)
**File**: `src/components/agent/MyCollectionPerformance.tsx`

A compact card for the agent dashboard showing:
- Their rank among peers
- Total collections this month
- Collection rate %
- Comparison to average

This component would be added to the agent's existing dashboard view.

## No Database Migration Needed
All required data already exists in `subscription_charge_logs`, `general_ledger`, `rent_requests`, and `profiles`. Rankings are computed client-side from aggregated queries.

## Query Strategy
- Collections feed: Query `subscription_charge_logs` (last 30 days, limit 200) joined to `subscription_charges` for agent/tenant IDs, then resolve names from `profiles`
- Rankings: Query `rent_requests` grouped by `agent_id`, sum `amount_repaid` vs `total_repayment` for collection rate, count active tenants
- Performance is bounded by existing Supabase query limits (paginated if needed)

| Change | File |
|---|---|
| Rent collections feed | `RentCollectionsFeed.tsx` (new) |
| Agent/Manager rankings | `AgentPerformanceRankings.tsx` (new) |
| Agent self-view card | `MyCollectionPerformance.tsx` (new) |
| CFO sidebar items | `executiveSidebarConfig.ts` |
| CFO dashboard wiring | `cfo/Dashboard.tsx`, `CFODashboard.tsx` |

