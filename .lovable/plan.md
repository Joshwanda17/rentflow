## Goal

Duplicate the **All Requests** tab from `TenantOpsDashboard` into `LandlordOpsDashboard`, plus the **Print Report** (PDF download) button — both adapted to the landlord lens.

## What gets added in `src/components/executive/LandlordOpsDashboard.tsx`

### 1. New view in the navigation
- Extend the `View` union with `'all-requests'`.
- Add a `navItems` entry: `{ id: 'all-requests', label: 'All Requests', icon: Table2, description: 'Full table of every rent request (landlord lens)' }` (placed in the priority group, near Landlords & Tenants).

### 2. Data query: `exec-landlord-ops-all-requests`
A `useQuery` that pulls the last 200 `rent_requests` and joins:
- `landlords` (name, phone) — primary lens
- `profiles` for tenant (name, phone) and agent (name)

Returns rows shaped like the tenant version but landlord-first:
`created_at, landlord_name, landlord_phone, status, rent_amount, amount_repaid, tenant_name, tenant_phone, agent_name, landlord_id`.

Enabled only when `view === 'all-requests'` or `view === 'home'` (so the Print Report can run from home).

### 3. New `'all-requests'` sub-view
Renders an `ExecutiveDataTable` with columns:
1. Date (created_at)
2. Landlord
3. Landlord Phone
4. Status (badge, same color map as tenant ops)
5. Rent Amount
6. Repaid
7. Tenant
8. Tenant Phone
9. Agent

Same status filter dropdown (`pending` → `defaulted`) as the tenant version. No bulk-delete on landlords (out of scope here).

### 4. Print Report button on the home view
Mirror the TenantOps UX: two date Popover/Calendar pickers (From / To), a Clear button, and a **Print Report** button — placed just above the Navigation Cards section (around line 1507).

### 5. New report generator: `src/lib/generateLandlordOpsReportPdf.ts`
Adapted from `generateTenantOpsReportPdf.ts`:
- Title: **"Landlord Payouts Report"**.
- One row per landlord aggregated from `general_ledger` payouts to landlords in the date window.
- Pulls `general_ledger` entries with category in (`landlord_payout`, `rent_disbursement`) and `direction = 'cash_out'` for the period, joins to `landlords` for name/phone, and to `rent_requests` to count properties + outstanding rent owed.
- Columns: Landlord, Phone, Properties, Tenants Paying, Amount Paid Out, Outstanding to Landlord, Last Payout Date.
- Same styling/header/footer/UGX formatting as the tenant version.

`handlePrintReport()` in `LandlordOpsDashboard` calls this generator and triggers a Blob download (filename: `welile-landlord-payouts-<from>-<to>.pdf`). Uses `sonner` `toast` for success/error/empty-period messages, matching the tenant flow.

### 6. Imports added to `LandlordOpsDashboard.tsx`
- `Table2`, `Printer`, `CalendarIcon`, `Loader2` from `lucide-react`
- `Popover`, `PopoverContent`, `PopoverTrigger`, `Calendar`, `cn`, `format`
- `ExecutiveDataTable`, `Column`
- `generateLandlordOpsReportPdf`
- `toast` from `sonner`

## Files touched

- `src/components/executive/LandlordOpsDashboard.tsx` — new view, query, nav item, print button + state.
- `src/lib/generateLandlordOpsReportPdf.ts` — **new file**, landlord-flavored PDF generator.

## Out of scope
- No changes to ledger categories or RLS.
- No bulk delete in landlord All Requests (landlords are managed by their own dialogs already).
- No edits to TenantOpsDashboard.
