

# Role-Based Executive & Department Dashboard System

## Scope Assessment

This is a large feature set spanning 8 new dashboards, sidebar navigation, access control, charts, data tables with filtering/sorting/export, and mobile-first responsive design. Given the size, this must be built in phases across multiple messages.

## What Already Exists
- **Manager Dashboard** at `/dashboard` (manager role) with KPIs, wallets, rent management
- **COO Dashboard** at `/coo-dashboard` with operations health metrics
- **CFO Dashboard** at `/cfo-dashboard` with financial statements, reconciliation, ledger
- **Manager Login** at `/manager-login` using access code `Manager@welile`
- **Desktop sidebar** in `DesktopManagerSidebar.tsx` with COO/CFO links
- **Mobile menu** in `MobileManagerMenu.tsx`
- Existing tables: `profiles`, `user_roles`, `rent_requests`, `general_ledger`, `wallets`, `investor_portfolios`, `landlords`, `agent_earnings`, `agent_commission_payouts`, `deposit_requests`, `referrals`, `system_events`, `notifications`

## Access Control Approach
All dashboards will be accessible from the Manager Dashboard sidebar/menu, gated by the existing `Manager@welile` access code (already in `ManagerLogin.tsx`). No new DB roles needed -- these are functional views within the manager area, not separate user roles.

## Phase 1 -- Navigation & Hub Page (This Implementation)

### 1. Create Executive Hub Page (`/executive-hub`)
A single page with sub-navigation (tabs) for all 8 dashboards. Accessible from the manager sidebar. Uses the same manager role check as COO/CFO dashboards.

### 2. Update Sidebar & Mobile Menu
Add "Executive & Ops" section to `DesktopManagerSidebar.tsx` and `MobileManagerMenu.tsx` linking to `/executive-hub`.

### 3. Build All 8 Dashboard Views as Tab Content

Each dashboard is a component under `src/components/executive/`:

**Executive Dashboards:**
- `CEODashboard.tsx` -- KPI tiles (Total Tenants, Funded Tenants, Rent Financed, Partners, Landlords, Revenue, Growth Rate, Active Agents) + 3 charts (tenant growth, capital raised, rent repayment)
- `CTODashboard.tsx` -- System health metrics (uptime placeholder, API performance from system_events, active users from profiles, error counts, fraud alerts placeholder)
- `CMODashboard.tsx` -- Growth metrics (signups over time from profiles, referral conversions from referrals, agent registration velocity)

**Department Dashboards:**
- `AgentOpsDashboard.tsx` -- Total/active agents, tenants onboarded, capital raised, leaderboard, commissions (from agent_earnings, agent_commission_payouts, profiles, rent_requests)
- `TenantOpsDashboard.tsx` -- Applications, verified, awaiting funding, active, repayment status, defaults (from rent_requests, profiles)
- `LandlordOpsDashboard.tsx` -- Registered landlords, active properties, rent sent, upcoming payments, agreements (from landlords, rent_requests)
- `PartnersOpsDashboard.tsx` -- Total partners, capital invested, portfolios, expected returns, payouts (from investor_portfolios, wallets)
- `CRMDashboard.tsx` -- Support tickets from system_events, inquiry counts, response time estimates

### 4. Shared Data Table Component
Create `src/components/executive/DataTable.tsx` -- a reusable table with:
- Column sorting (click header)
- Text search filter
- Status/category dropdown filter
- CSV export button
- PDF export button (using jsPDF already installed)
- Default limit: 15 latest records
- Mobile-responsive: horizontal scroll with sticky first column

### 5. Chart Components
Use recharts (already installed) for:
- Line charts (growth trends)
- Bar charts (comparisons)
- Area charts (cumulative metrics)

All charts responsive with `ResponsiveContainer`.

### 6. Route Registration
Add `/executive-hub` route in `App.tsx`, lazy-loaded.

## Data Sources (No New Tables Required)

All metrics are derived from existing tables:

| Metric | Source Table |
|--------|-------------|
| Total tenants | `profiles` + `user_roles` where role='tenant' |
| Funded tenants | `rent_requests` where status='funded'/'disbursed' |
| Rent financed | `rent_requests` SUM(rent_amount) |
| Partners | `user_roles` where role='supporter' |
| Landlords | `landlords` COUNT |
| Revenue | `general_ledger` where category in revenue categories |
| Active agents | `profiles` + `user_roles` where role='agent' |
| Agent earnings | `agent_earnings`, `agent_commission_payouts` |
| Repayment status | `rent_requests` amount_repaid vs total |
| System events | `system_events` |
| Referrals | `referrals` |
| Investor capital | `investor_portfolios` |

## File Structure
```text
src/
  pages/
    ExecutiveHub.tsx            -- main page with tab navigation
  components/
    executive/
      CEODashboard.tsx
      CTODashboard.tsx
      CMODashboard.tsx
      AgentOpsDashboard.tsx
      TenantOpsDashboard.tsx
      LandlordOpsDashboard.tsx
      PartnersOpsDashboard.tsx
      CRMDashboard.tsx
      ExecutiveDataTable.tsx    -- shared filterable/sortable/exportable table
      KPICard.tsx               -- reusable metric tile
      ExecutiveSidebar.tsx      -- sidebar within the hub page
```

## Mobile-First Design
- All dashboards use a stacked card layout on mobile
- Tab navigation becomes a horizontal scrollable strip on small screens
- Data tables scroll horizontally with sticky first column
- Charts use full width with minimum height of 200px
- Touch-friendly: min 44px tap targets

## Estimated Scope
- ~12 new files
- ~2 modified files (App.tsx, DesktopManagerSidebar.tsx, MobileManagerMenu.tsx)
- No database migrations needed
- No new Edge Functions needed

