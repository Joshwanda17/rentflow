

# Expand COO Agent Activity Tab — Full Tracking Hub

## Current State
The COO "Agent Activity" tab only renders `CashoutAgentActivity` — a single feed of cashout agent actions. The reference image shows this should be a comprehensive 8-module agent tracking hub covering daily reports, payment tracking, defaulter control, field accountability, weekly scorecards, and red flags.

## Data Sources Already Available
- `rent_requests` — tenant contracts, amounts, agent assignments, status
- `agent_collections` — manual collections by agent
- `subscription_charge_logs` — auto-charges (daily rent deductions)
- `agent_visits` — GPS check-ins, photo proofs, visit timestamps
- `lc1_chairpersons` — landlords registered by agents
- `profiles` — agent/tenant info
- `agent_float_limits` — daily collection targets

## New Component: `COOAgentTracker.tsx`

A single comprehensive component with 8 collapsible sections, one per module from the reference:

### 1. Agent Selector (top)
- Dropdown to pick a specific agent or "All Agents"
- Date range picker (defaults to today)

### 2. Daily Report Card
Per agent: New Tenants registered today, Payments collected (UGX), Defaulters count, Follow-ups (visits), New Landlords registered. Data from `rent_requests`, `agent_collections`, `agent_visits`, `lc1_chairpersons`.

### 3. Key Numbers (KPI row)
4 KPI cards: Total Expected Rent, Total Collected, Total Arrears, Collection Rate %. Pulled from active `rent_requests` (expected) vs `agent_collections` + `subscription_charge_logs` (collected).

### 4. Payment Tracking
Progress bar showing Expected vs Collected per agent. Daily arrears amount. From `rent_requests.monthly_rent` vs actual collections.

### 5. Defaulter Control
List tenants with overdue rent where no recent visit/collection exists. Show last visit date, last collection date, and days overdue. Flag tenants with no follow-up in 7+ days.

### 6. Field Accountability
GPS check-in log from `agent_visits` — show photo proof status, location name, timestamp. Count visits today per agent.

### 7. Weekly Scorecard
Weighted score: Collections 40%, Active Tenants 20%, Follow-ups 20%, New Landlords 20%. Calculated from the past 7 days of data. Displayed as a simple bar or radial chart per metric.

### 8. Red Flags
Auto-generated alerts: Low collections (<50% of expected), High defaults (>30% tenants overdue), No follow-ups in 3+ days. Displayed as warning cards.

### 9. Cashout Activity (existing)
Keep the existing `CashoutAgentActivity` at the bottom as a dedicated section.

## Changes

### File: `src/components/coo/COOAgentTracker.tsx` (new)
- All 8 modules in a single scrollable view with section headers
- Agent filter dropdown + date picker at top
- Each section is a Card with a colored header matching the reference style
- Uses existing Supabase tables — no migrations needed

### File: `src/pages/coo/Dashboard.tsx`
- Import `COOAgentTracker` 
- Replace the `agent-activity` case content: render `COOAgentTracker` instead of just `CashoutAgentActivity`
- Keep `CashoutAgentActivity` as a sub-section within the tracker

| File | Change |
|---|---|
| `src/components/coo/COOAgentTracker.tsx` | New — 8-module agent tracking hub |
| `src/pages/coo/Dashboard.tsx` | Swap `CashoutAgentActivity` for `COOAgentTracker` in agent-activity case |

