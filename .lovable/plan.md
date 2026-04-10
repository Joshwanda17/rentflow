

# Add Ledger Health Tab to CFO Dashboard

## Overview
Add a new "Ledger Health" tab in the CFO sidebar that queries the `classification` column on `general_ledger` and displays a real-time breakdown of production vs legacy vs test vs correction entries with totals.

## Changes

### 1. Sidebar Config
**File:** `src/components/layout/executiveSidebarConfig.ts`
- Add `{ label: 'Ledger Health', icon: ShieldCheck, id: 'ledger-health' }` to the CFO Finance section (after Approval Audit)
- Import `Activity` or reuse existing `ShieldCheck` icon

### 2. New Component
**File:** `src/components/cfo/LedgerHealthPanel.tsx`

A panel that queries `general_ledger` grouped by `classification` and shows:
- **4 KPI cards** (one per classification): entry count, total cash_in, total cash_out, net — color-coded:
  - Production (green) — locked categories, real money
  - Legacy Real (blue) — pre-lockdown operational entries
  - Test/Dev (amber) — opening balances, cleanup
  - Admin Correction (gray) — manual adjustments
- **Summary table** below with per-category rows within each classification group
- **Totals row** showing combined real money (production + legacy_real) vs excluded (test_dev + admin_correction)
- Uses existing `Card`, `KPICard`, and `Badge` components
- Single `supabase` query: `SELECT classification, direction, count(*), sum(amount) FROM general_ledger GROUP BY classification, direction`

### 3. Dashboard Router
**File:** `src/pages/cfo/Dashboard.tsx`
- Import `LedgerHealthPanel`
- Add `case 'ledger-health': return <LedgerHealthPanel />;` to the switch

### No database changes
The `classification` column already exists and is populated.

