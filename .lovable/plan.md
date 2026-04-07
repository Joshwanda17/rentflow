

# Convert Agent Activity Sections to Toggle Tabs

## What Changes
Replace the current collapsible accordion layout (8 `CollapsibleAgentSection` blocks) with a toggle-style tab navigation — similar to the `ModernOpportunityTabs` pattern already used in the app. The user selects a module via a horizontally scrollable pill/toggle bar, and only the selected module's content renders below.

## Current State
- All 8 modules (Daily Report, Key Numbers, Payment Tracking, Defaulter Control, Field Accountability, Weekly Scorecard, Red Flags, Cashout Activity) render as stacked collapsible accordions
- Data is already pulled from real database tables (`rent_requests`, `agent_collections`, `subscription_charge_logs`, `agent_visits`)

## Design
- Replace accordion with a horizontally scrollable toggle bar at the top (below the agent/date filters)
- Each toggle pill shows the module icon + short label + optional badge count (e.g., "4 unpaid" for Defaulter Control, alert count for Red Flags)
- Active pill gets a colored background (primary), inactive pills are muted
- Only the active module's content renders below — no more expand/collapse
- Keep the exact same content blocks and data queries unchanged

## File: `src/components/coo/COOAgentTracker.tsx`

1. Replace `openSections` state with a single `activeModule` state (default: `'daily'`)
2. Define a `modules` array with `{ id, label, icon, badgeCount?, badgeColor? }` for each of the 8 sections
3. Render a horizontally scrollable toggle bar using styled buttons (rounded-full pills with `bg-primary text-white` for active, `bg-muted/50` for inactive)
4. Conditionally render only the content block matching `activeModule`
5. Remove `CollapsibleAgentSection` usage — render content directly in plain cards
6. All queries and computed metrics remain identical

| File | Change |
|---|---|
| `src/components/coo/COOAgentTracker.tsx` | Replace accordion with toggle-tab navigation, keep all data queries |

No database changes. No new files needed.

