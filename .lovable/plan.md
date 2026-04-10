

# Redesign COO Agent Activity Tab — Executive-Grade Agent Tracker

## What Changes
Replace the current `COOAgentTracker` component (used in the COO dashboard's "Agent Activity" tab) with a new two-panel, executive-grade agent management hub inspired by the reference image.

## Layout

```text
┌──────────────────────┬──────────────────────────────────────────┐
│  LEFT PANEL (280px)  │  RIGHT PANEL (flex-1)                   │
│  Deep blue bg        │                                         │
│                      │  [Search] [Status Filter] [Sort By]     │
│  All Agents  (42)    │                                         │
│  Active      (38)    │  ┌─ Agent Row ─────────────────────┐    │
│  Inactive    (2)     │  │ Name  Tenants  Landlords  Comm  │    │
│  Pending     (1)     │  │ Wallet  Status         Actions  │    │
│  Top Perf.   (5)     │  └─────────────────────────────────┘    │
│  At Risk     (3)     │  ┌─ Agent Row ─────────────────────┐    │
│                      │  │ ...                              │    │
│  ── KPI Summary ──   │  └─────────────────────────────────┘    │
│  Total Commission    │                                         │
│  Total Collections   │  ── Agent Detail Drawer (on click) ──   │
│  Avg Wallet Bal.     │  Profile | Wallet | Commissions |       │
│                      │  Linked Tenants & Landlords |           │
│                      │  Recent Activity Timeline               │
└──────────────────────┴──────────────────────────────────────────┘
```

On mobile, the left panel collapses to a horizontal scrollable chip bar.

## Data Fetching
- **Agents list**: Query `profiles` where role = `agent`, joined with:
  - `rent_requests` count (grouped by `assigned_agent_id`) for tenants managed
  - `properties` or `landlord_profiles` count for landlords onboarded
  - `agent_earnings` sum for total commission
  - `wallets` for wallet balance
  - `last_active_at` from profiles for status classification
- **Status classification**: Active (last_active < 7d), Inactive (7-30d), At Risk (30d+), Pending (no activity), Top Performers (commission > threshold)
- **Realtime**: Subscribe to `profiles` changes for agent status updates

## Agent Detail Panel (slide-in on row click)
- Profile card (name, phone, email, joined date)
- Wallet balance with mini-chart
- Commission history (last 10 entries from `agent_earnings`)
- Linked tenants (from `rent_requests`)
- Linked landlords (from properties/assignments)
- Recent activity timeline (from `agent_visits`, `agent_collections`)

## Files Changed

### New Files
- **`src/components/coo/COOAgentHub.tsx`** — Main two-panel layout with left nav, right content, filters, search, sort, and agent detail drawer
- **`src/components/coo/AgentDetailDrawer.tsx`** — Slide-in panel showing full agent profile, wallet, commissions, linked tenants/landlords, and activity timeline

### Edited Files
- **`src/pages/coo/Dashboard.tsx`** — Replace `<COOAgentTracker />` with `<COOAgentHub />` in the `agent-activity` case
- **`src/components/layout/executiveSidebarConfig.ts`** — Rename "Agent Activity" to "Agents" for clarity

## Visual Style
- Left panel: `bg-[#1a1f3d]` (deep navy), white text, large bold category labels, counts in badges
- Right panel: White/card background, clean table rows with subtle hover states
- Status indicators: Green dot (Active), Gray (Inactive), Yellow (Pending), Red (At Risk), Gold star (Top Performer)
- Bold typography, generous whitespace, strong visual hierarchy
- Accessible contrast ratios, keyboard-navigable rows and filters

