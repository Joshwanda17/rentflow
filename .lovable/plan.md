

# Role-Based Dashboard Isolation — Refactoring Plan

## Current State

- **5 dashboards** exist in `src/components/dashboards/`: Agent, Tenant, Landlord, Supporter, Manager
- **Executive dashboards** (CEO, CTO, CMO, CRM) live in `src/components/executive/` and are accessed via `/executive-hub?tab=X` — a single page with tab switching
- **COO and CFO** have standalone pages at `/coo-dashboard` and `/cfo-dashboard`
- **No role-based routing** — all users land on `/dashboard` and see a role-switched view
- **Manager sidebar** links to executive dashboards as sidebar items — violating isolation
- **14 roles** in DB but Dashboard.tsx only renders 5 (tenant, agent, supporter, landlord, manager)
- No route guards — any authenticated user can navigate to any URL

## Architecture

```text
┌─────────────────────────────────────────────────┐
│  /dashboard  (multi-role: agent/tenant/         │
│               landlord/supporter)                │
├─────────────────────────────────────────────────┤
│  /cto/dashboard    ← CTO role only              │
│  /cfo/dashboard    ← CFO role only              │
│  /coo/dashboard    ← COO role only              │
│  /cmo/dashboard    ← CMO role only              │
│  /crm/dashboard    ← CRM role only              │
│  /ceo/dashboard    ← CEO role only              │
│  /admin/dashboard  ← super_admin + manager      │
│  /operations/*     ← operations role (existing) │
│  /employee/dashboard ← employee role            │
├─────────────────────────────────────────────────┤
│  RoleGuard wrapper enforces access on all       │
│  role-prefixed routes                           │
└─────────────────────────────────────────────────┘
```

## Implementation Steps

### 1. Create `RoleGuard` component
A wrapper that checks if the current user has the required role(s). If not, redirects to `/dashboard`. Used on every role-prefixed route.

```tsx
// src/components/auth/RoleGuard.tsx
<RoleGuard allowedRoles={['cto']}>
  <CTODashboardPage />
</RoleGuard>
```

### 2. Create `ExecutiveDashboardLayout` shared layout
A standardized shell for all executive/internal dashboards with:
- **Top bar**: Welile logo, role switcher (center), sign out
- **Left sidebar**: Role-specific menu items + "Exit Dashboard" link
- **Mobile**: Sticky purple header, slide-out drawer for nav
- Replaces the current ad-hoc layouts in COO/CFO pages

### 3. Create standalone page files for each executive role

| File | Route | Content Source |
|------|-------|----------------|
| `src/pages/cto/Dashboard.tsx` | `/cto/dashboard` | Wraps existing `CTODashboard` component |
| `src/pages/ceo/Dashboard.tsx` | `/ceo/dashboard` | Wraps existing `CEODashboard` component |
| `src/pages/cmo/Dashboard.tsx` | `/cmo/dashboard` | Wraps existing `CMODashboard` component |
| `src/pages/crm/Dashboard.tsx` | `/crm/dashboard` | Wraps existing `CRMDashboard` component |
| `src/pages/cfo/Dashboard.tsx` | `/cfo/dashboard` | Refactors existing `CFODashboard.tsx` |
| `src/pages/coo/Dashboard.tsx` | `/coo/dashboard` | Refactors existing `COODashboard.tsx` |
| `src/pages/admin/Dashboard.tsx` | `/admin/dashboard` | Manager dashboard + Executive Hub access panel |

Each page uses `ExecutiveDashboardLayout` with role-specific sidebar config.

### 4. Update login routing in `Dashboard.tsx`
Add a `useEffect` that checks for executive/internal roles and redirects:

```text
cto → /cto/dashboard
cfo → /cfo/dashboard
coo → /coo/dashboard
cmo → /cmo/dashboard
crm → /crm/dashboard
ceo → /ceo/dashboard
super_admin → /admin/dashboard
manager → /admin/dashboard
employee → /dashboard (or dedicated page)
operations → /operations (existing)
```

Multi-role users with standard roles (agent/tenant/landlord) stay on `/dashboard` with the role switcher.

### 5. Update `App.tsx` routes
Add all new role-prefixed routes wrapped in `RoleGuard`:

```text
/cto/dashboard, /cto/*
/cfo/dashboard, /cfo/*
/coo/dashboard, /coo/*
/cmo/dashboard, /cmo/*
/crm/dashboard, /crm/*
/ceo/dashboard, /ceo/*
/admin/dashboard, /admin/*
```

Remove old flat routes (`/coo-dashboard`, `/cfo-dashboard`, `/executive-hub`).

### 6. Clean up Manager Sidebar
Remove all executive dashboard links from `DesktopManagerSidebar.tsx`. The "Executive & Ops" section becomes a "Dashboard Access Panel" only visible to `super_admin` and `manager` roles — opening each dashboard in its own route (not inline).

### 7. Create Admin Dashboard Access Panel
For `super_admin` and `manager` roles at `/admin/dashboard`:
- Grid of cards linking to each executive/operations dashboard
- Grouped into "Executive Dashboards" and "Operations Dashboards"
- Clicking opens the actual dashboard route (e.g., `/cto/dashboard`)

### 8. Role-specific sidebar configurations
Each dashboard gets a unique sidebar menu defined in a config object:

- **CTO**: System Infrastructure, API Management, Security Logs, Developer Tools
- **CFO**: Financial Overview, Solvency, Statements, Reconciliation, Ledger
- **COO**: Overview, Agent Performance, Property Ops, Revenue, Payments, Wallets
- **CMO**: Growth Metrics, Signup Trends, Referral Performance
- **CRM**: Customer Inquiries, Support Tickets, Disputes
- **CEO**: Platform Overview, Revenue, Users, Growth

### Files to create (~12)
- `src/components/auth/RoleGuard.tsx`
- `src/components/layout/ExecutiveDashboardLayout.tsx`
- `src/components/layout/executiveSidebarConfig.ts`
- `src/pages/cto/Dashboard.tsx`
- `src/pages/ceo/Dashboard.tsx`
- `src/pages/cmo/Dashboard.tsx`
- `src/pages/crm/Dashboard.tsx`
- `src/pages/cfo/Dashboard.tsx` (refactor existing)
- `src/pages/coo/Dashboard.tsx` (refactor existing)
- `src/pages/admin/Dashboard.tsx`

### Files to modify (~5)
- `src/App.tsx` — Add role-prefixed routes, remove old flat routes
- `src/pages/Dashboard.tsx` — Add executive role redirect logic
- `src/components/manager/DesktopManagerSidebar.tsx` — Remove executive links, add access panel
- `src/hooks/auth/roleManager.ts` — Update default role logic for executive roles
- `src/components/RoleSwitcher.tsx` — Ensure role switch navigates to correct dashboard route

