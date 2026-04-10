

# Add PDF Print Button to Tenant Ops Dashboard

## What
Add a "Print Report" button to the Tenant Ops overview that generates a professional PDF report showing all tenants with their rent details: amount given, amount paid, outstanding balance, responsible agent, days paid for, and number of payments made.

## Data Source
Query `rent_requests` joined with `profiles` (tenant names/phones), `profiles` again for agent names (via `agent_id`), plus `number_of_payments` and `duration_days` already on the rent_requests table. Payment count comes from `subscription_charge_logs` (count per tenant).

## Implementation

### 1. Create `src/lib/generateTenantOpsReportPdf.ts`
A new PDF generator (following the existing `generateAgentTenantPdf.ts` pattern with jsPDF) that produces an A4 report with:
- **Header**: "WELILE — Tenant Rent Report" + date
- **Summary row**: Total tenants, total rent given, total repaid, total outstanding
- **Table columns**: #, Tenant Name, Phone, Rent Given, Amount Paid, Outstanding, Agent Name, Duration (days), Payments Made
- **Color coding**: Outstanding > 0 in red, fully paid in green
- **Totals footer row**
- **Welile branding footer**

### 2. Update `TenantOpsDashboard.tsx`
- Add a `Printer` icon button next to the navigation cards area (on the overview screen)
- On click: fetch full tenant data with agent names and payment counts, call the PDF generator, trigger browser download
- The query will:
  - Fetch all funded/repaying/disbursed rent_requests with agent_id
  - Join profiles for tenant + agent names
  - Count payments from `subscription_charge_logs` grouped by tenant_id
  - Compute outstanding = total_repayment - amount_repaid

### Files Changed
- **New**: `src/lib/generateTenantOpsReportPdf.ts`
- **Edit**: `src/components/executive/TenantOpsDashboard.tsx` — add print button + data fetch logic

