## Active Tenants Report (PDF) — Tenant Ops

Add a one-click PDF export on the **COO → Reports → Tenant Ops** page that lists every currently-repaying tenant (with their assigned agent) as one row per tenant.

### Where it lives
- New button "Download Active Tenants (PDF)" placed in the header area of `src/pages/coo/reports/TenantOpsReport.tsx`, next to the existing "Generate / Refresh" action exposed by `COOReportPage`.
- Same visual treatment as the existing nearing-payouts export so it feels native.

### Data source (read-only, no schema changes)
Pulled client-side from existing tables (RLS already permits COO):

- `rent_requests` — filter `status IN ('funded','disbursed','repaying','active','approved')` AND `disbursed_at IS NOT NULL` (i.e. money has gone out and tenant is repaying). Fields: `tenant_id`, `agent_id`, `rent_amount` (principal), `total_repayment` (expected), `disbursed_at` (start), `due_date` / `repayment_end_date` (end), `id`.
- `profiles` — for tenant name + phone, and for agent name + phone (joined by `tenant_id`, `agent_id`).
- `agent_collections` (or `general_ledger` repayment legs, whichever the existing daily report uses) — sum of `amount` per `rent_request_id` to get **Total Repaid**, then **Outstanding = total_repayment − total_repaid**.

Fetched in a single hook `useActiveTenantsReport()` placed under `src/components/coo/`. Pagination via `range()` loop (1000-row Supabase limit) to be safe at scale.

### PDF
- New helper `src/lib/activeTenantsReportPdf.ts` built on the existing `generateTenantOpsExtractPdf` (landscape A4, branded header, KPI strip, striped table, page footer) — no new PDF engine.
- KPI strip: Active tenants · Total principal disbursed · Total expected · Total collected · Total outstanding · Collection rate %.
- Table — one row per active tenant:

  | # | Tenant Name | Phone | Agent | Principal Paid | Expected (Total Repayment) | Outstanding | Start Date | End Date |

  Totals row at the bottom (Principal / Expected / Outstanding).
- File name: `active-tenants-YYYY-MM-DD.pdf`.

### UX
- Button shows spinner while fetching + generating; toast on success/error (matches the nearing-payouts export pattern).
- No date picker in v1 — the report is a snapshot of currently-active tenants as of "now". (Easy to add a date filter later if needed.)

### Out of scope
- No backend / edge function / RLS / schema changes.
- No CSV variant (PDF only, per the established pattern for COO exports).
- No changes to the existing dashboard KPIs/charts on the Tenant Ops page.

### Confirm before I build
1. **"Company principal paid"** = `rent_requests.rent_amount` (the rent the platform disbursed to the landlord on the tenant's behalf). Correct interpretation?
2. **"Agent assigned"** = `rent_requests.agent_id` (the agent on the rent plan). If a tenant has multiple active rent plans, should they appear as multiple rows (one per plan) or be collapsed into one row with the latest plan? Default plan: **one row per active rent plan** (clearer and matches how outstanding is tracked).
3. Include agent **phone** alongside agent **name** in the Agent column, or name only?
