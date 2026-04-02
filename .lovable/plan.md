# Angel Pool Management Page for CEO & CFO Dashboards

## Overview

Create a dedicated **Angel Pool** sidebar item for both the CEO and CFO dashboards, rendering a comprehensive management page with KPIs, shareholder chart, sortable/exportable table, and a CEO-only edit dialog for pool parameters.

## Changes

### 1. Add Sidebar Items

**File**: `src/components/layout/executiveSidebarConfig.ts`

- Add `{ label: 'Angel Pool', icon: Layers, id: 'angel-pool' }` to both the `ceo` and `cfo` sidebar sections
- Import `Layers` icon

### 2. Create Angel Pool Management Panel

**New file**: `src/components/executive/AngelPoolManagementPanel.tsx`

**Layout (top to bottom):**

1. **Header row** — Title "Angel Pool" + "Edit Pool Settings" button (visible only when `userRole === 'ceo'`). Button opens an edit dialog.
2. **KPI Cards** (4-column grid, responsive 2-col on mobile):
  - Total Raised (USh) — from `useAngelPoolData`
  - Pool Target (USh) — from constants
  - Shares Sold / Remaining
  - Pool Fill % (progress)
  - Total Shareholders (count of unique investors)
  - Company Equity Allocated (shares sold / total × 8%)
3. **Shareholder Distribution Chart** — Recharts `BarChart` showing top 10 shareholders by shares owned. Responsive via `ResponsiveContainer`. X-axis: investor name (truncated), Y-axis: shares.
4. **Shareholders Table** — Using existing `ExecutiveDataTable` pattern or raw table with:
  - Columns: #, Name, Shares, Amount (USh), Pool %, Company %, Date, Status
  - **Sorting**: Click column headers to sort ascending/descending
  - **Export CSV**: Button that generates and downloads a CSV of all shareholders
  - **Responsive**: Hides secondary columns on mobile via `hidden sm:table-cell`
  - **Pagination**: 15 rows per page
5. **Edit Pool Settings Dialog** (CEO-only):
  - Fields: Total Pool Target (UGX), Total Shares, Price Per Share, Company Equity %
  - These update local state / constants (since pool params are currently hardcoded in `constants.ts`, the dialog will call an edge function or store in a config table)
  - For now: store in a new `angel_pool_config` table (single row) with fallback to hardcoded constants
  - Only the CEO role can see and interact with this button

### 3. Database Migration

Create `angel_pool_config` table:

```sql
CREATE TABLE public.angel_pool_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_pool_ugx bigint NOT NULL DEFAULT 500000000,
  total_shares integer NOT NULL DEFAULT 25000,
  price_per_share integer NOT NULL DEFAULT 20000,
  pool_equity_percent numeric(5,2) NOT NULL DEFAULT 8.00,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.angel_pool_config ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read
CREATE POLICY "Authenticated read angel_pool_config"
  ON public.angel_pool_config FOR SELECT TO authenticated USING (true);

-- Only CEO can update (via edge function with service role, but policy as safety net)
CREATE POLICY "CEO update angel_pool_config"
  ON public.angel_pool_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'ceo'));

CREATE POLICY "CEO insert angel_pool_config"
  ON public.angel_pool_config FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'ceo'));

-- Seed default row
INSERT INTO public.angel_pool_config (total_pool_ugx, total_shares, price_per_share, pool_equity_percent)
VALUES (500000000, 25000, 20000, 8.00);
```

### 4. Hook: `useAngelPoolConfig`

**New file**: `src/hooks/useAngelPoolConfig.ts`

- Fetches the single row from `angel_pool_config`
- Falls back to hardcoded constants if no row exists
- Provides a `updateConfig` mutation (upsert) for the CEO edit dialog

### 5. Wire into CEO & CFO Dashboard Pages

**File**: `src/pages/ceo/Dashboard.tsx`

- Import `AngelPoolManagementPanel`
- Add case `'angel-pool'` → `<AngelPoolManagementPanel userRole="ceo" />`

**File**: `src/pages/cfo/Dashboard.tsx`

- Import `AngelPoolManagementPanel`
- Add case `'angel-pool'` → `<AngelPoolManagementPanel userRole="cfo" />`

### Files Changed

- **Edit**: `src/components/layout/executiveSidebarConfig.ts` — add Angel Pool sidebar item to CEO and CFO
- **New**: `src/components/executive/AngelPoolManagementPanel.tsx` — full panel with KPIs, chart, table, edit dialog
- **New**: `src/hooks/useAngelPoolConfig.ts` — config fetch/update hook
- **Edit**: `src/pages/ceo/Dashboard.tsx` — add angel-pool tab case
- **Edit**: `src/pages/cfo/Dashboard.tsx` — add angel-pool tab case
- **Migration**: Create `angel_pool_config` table with RLS
- ensure to log for auditing.