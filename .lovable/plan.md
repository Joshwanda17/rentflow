# Tenant Ops — quick report extracts

Add four CSV-export buttons to the Tenant Ops dashboard, alongside the existing "Print Report" PDF, sharing the same From/To date pickers that are already there:

1. **Tenants Applied** — every `rent_requests` row created in the window.
2. **Tenants Approved** — every `rent_requests` row with `approved_at` in the window (status = approved/funded/disbursed/active/etc., excluding rejected).
3. **Repayments Collected** — sum + per-tenant breakdown of `general_ledger` entries with category in (`tenant_repayment`, `rent_repayment`), `direction='cash_in'`, `transaction_date` in window. Same source as the existing PDF, so the totals match.
4. **Expected Repayments** — for every active rent plan whose tenancy overlaps the window, the daily‑repayment × overlap‑days expected, minus repaid → outstanding. Sums across the portfolio.

Each button downloads a CSV (`/mnt/documents/`-style local download — actually a browser download via `Blob`, no server file needed) using the existing `csvExport` helper (`src/lib/csvExport.ts`).

## UI placement

In the same toolbar row that already contains `From`, `To`, `Clear`, and `Print Report`, add a single new **"Extract"** dropdown (shadcn `DropdownMenu`) with the four items. This keeps the row from getting noisy and works on mobile (one extra control instead of four extra buttons). Each item shows a tiny spinner while its CSV is being prepared.

## Data sources & SQL

| Report | Table / scope | Filter |
|---|---|---|
| Applied | `rent_requests` | `created_at` between From and To |
| Approved | `rent_requests` | `approved_at` between From and To AND `status NOT IN ('rejected','cancelled')` |
| Collected | `general_ledger` | `category IN ('tenant_repayment','rent_repayment')` AND `direction='cash_in'` AND `transaction_date` in window |
| Expected | `rent_requests` | active plans (`status IN ('approved','funded','disbursed','active','repaying')` AND `tenancy_status` not ended), expected = `daily_repayment × overlap_days(window, plan_start, plan_end)`; outstanding = `total_repayment − amount_repaid` |

For Collected, reuse the same tenant‑resolution logic as `handlePrintReport` (resolve agent‑legged payments back to the true tenant via `rent_requests.tenant_id` / `agent_collections.tenant_id`) so the figures reconcile with the PDF.

## CSV columns

- **Applied**: `request_id, tenant_name, tenant_phone, landlord_name, rent_amount, daily_repayment, duration_days, status, applied_at`
- **Approved**: `request_id, tenant_name, tenant_phone, rent_amount, total_repayment, daily_repayment, approved_at, approved_by_name, status`
- **Collected**: `payment_date, tenant_name, tenant_phone, agent_name, amount, source` + a final TOTAL row
- **Expected**: `request_id, tenant_name, tenant_phone, daily_repayment, days_in_window, expected_in_window, total_repayment, amount_repaid, outstanding` + a final TOTAL row

## Defaults & guardrails

- If the user has not picked a From/To, default to **last 30 days** for Applied/Approved/Collected; Expected defaults to **today → end of longest active plan** (so the user always sees a meaningful number on first click).
- Toast a clear message and skip download if the result is empty.
- Each CSV filename: `tenants-applied_<from>_<to>.csv`, etc., matching the existing PDF naming.

## Files to touch

- `src/components/executive/TenantOpsDashboard.tsx` — add the dropdown, four handlers, and reuse the existing date state.
- (No new shared lib file — extraction logic lives next to the existing `handlePrintReport` to keep the change local. If it grows we can move it later.)

No new tables, no new RPCs, no migration. Permissions are already enforced by the dashboard's role gate (Tenant Ops / COO / CFO / super_admin).
