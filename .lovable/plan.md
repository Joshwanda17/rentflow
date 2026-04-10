

# Add "Start Date" Column to Tenant Rent Report PDF

## What changes
The Tenant Rent Report PDF currently lacks the date when rent was disbursed to the tenant. We'll add a **"Start Date"** column showing when the money was given.

## Technical details

### 1. Edit `src/components/executive/TenantOpsDashboard.tsx`
- Add `created_at` to the `rent_requests` select query (line 62)
- Pass `start_date: r.created_at` into each row object (line 92-101)

### 2. Edit `src/lib/generateTenantOpsReportPdf.ts`
- Add `start_date: string` to the `TenantRentRow` interface
- Add a **"Start Date"** column to the table (between "Tenant Name" and "Phone", or after "Agent")
- Shift existing column positions to accommodate the new column
- Format the date as `dd MMM yyyy` using `date-fns`

### Files changed
- `src/components/executive/TenantOpsDashboard.tsx` — fetch & pass `created_at`
- `src/lib/generateTenantOpsReportPdf.ts` — render new "Start Date" column

