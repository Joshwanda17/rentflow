# Centralize existing Tenant Ops reports under Reports Hub → Extract

## What this is
A discovery/centralization change only. Every report keeps living exactly where it lives today; the Reports & Exports hub gains one panel that lists all of them and triggers the *same* existing export code.

## Audit — reports that already exist in the Tenants Ops Dashboard (Classic)

| Existing report | Lives in | Behaviour today | Filters | Source logic |
|---|---|---|---|---|
| Tenants applied / approved / funded / repayments collected / repayments expected | Reports & Exports section (Extract dropdown) | CSV + PDF | From/To date pickers | `generateTenantOpsExtractPdf` + in-file queries |
| Print Report (Tenant Ops summary) | Reports & Exports section | PDF print | From/To | `generateTenantOpsReportPdf` |
| All Tenants — active tenants register | All Tenants workspace | PDF | none | `activeTenantsReportPdf` |
| Agent Rent Capacity | Agent Rent Capacity workspace | PDF | search/eligibility on screen | `generateAgentCapacityPdf` |
| Pipeline Status (lifecycle, receivables, landlord payables) | Pipeline Status workspace | CSV, Excel, PDF, print | date range, section, search | `generatePipelineHubReportPdf`, `downloadCsv`, `downloadXlsx` |
| Daily Collection Monitoring | Daily Collection Monitoring workspace | PDF + CSV | day, missed-days window | `generateDailyCollectionReportPdf` |
| Daily Payments (daily performance) | Daily Payments tool | PDF + WhatsApp share | day | `dailyPerformanceReport` |
| Agent Allocations | Agent Allocations tool | PDF | period | `generateAgentAllocationPdf` |
| Agent Landlord Float Timeline | Float Timeline tool | CSV + PDF of filtered view | date/agent/type filters | `exportUtils` + timeline PDF |
| Daily Rent Repayments | Daily Rent Repayments tool | CSV + PDF | day, search | `DailyRentReport` (`mode="tenant"`), `pdfAuditReport` |
| Tool reports: Review Requests, Approval History, Missed Days, Daily Payments, Tenant Behavior, Transfer Audit | each tool's header (`TenantOpsReportToolbar`) | landscape PDF | presets (Today/7d/30d/Month/All) + status + search | `ops_tenant_ops_tool_report` RPC + `generateTenantOpsToolReportPdf` |
| Tenant Operations Word Report | Tenant Ops Hub header | DOCX | none | `generate-tenant-ops-docx` edge function |

No other exportable report exists in the dashboard (Missed Days, Tenant Behavior, Approval History, Transfer Audit, Landlord Float Panel have no export of their own beyond the shared toolbar).

## What gets built

One new component, `src/components/executive/tenant-ops/TenantOpsExtractCenter.tsx`, rendered inside the existing `reports-hub` view directly beneath today's Extract toolbar (which stays untouched).

Structure — existing terminology, existing card/accordion/button components:

```text
Reports & Exports
  [ existing From / To / Extract / Print Report toolbar ]   <- unchanged
  Extract — all Tenant Ops reports
    Tenants        · Tenants applied · Tenants approved · All Tenants register · Review Requests · Transfer Audit · Tenant Behavior
    Payments       · Daily Payments · Daily Collection Monitoring · Daily Rent Repayments
    Repayments     · Repayments collected · Repayments expected · Missed Days · Approval History
    Receivables    · Pipeline Status (receivables & landlord payables) · Agent Landlord Float Timeline · Agent Allocations
    Capacity & summaries · Agent Rent Capacity · Print Report · Word Report
```

Each row is one existing report with its name, a one-line description of what it contains, and one action:

- **Direct export** when the report's existing export needs no on-screen filter state — it calls the same exported helper/handler (applied, approved, funded, collected, expected, All Tenants PDF, Word Report, Print Report, the six `ops_tenant_ops_tool_report` tool PDFs, Daily Rent Repayments for the chosen day).
- **Open report** when the export is bound to that view's own filters (Pipeline Status, Daily Collection Monitoring, Float Timeline, Agent Allocations, Agent Rent Capacity, Daily Payments) — the row navigates to the existing view via the dashboard's existing `openHub(view)`, so the manager lands on the real report with its own export controls. No logic is copied.

The hub's From/To dates already in the Reports & Exports toolbar are reused as the range for the direct extracts that accept a range; the tool PDFs reuse their existing preset default.

## Technical notes
- Extraction handlers currently defined inline in `TenantOpsDashboard.tsx` are passed into the new panel as props (`onExtractApplied`, etc.) — no query or PDF logic is duplicated or re-implemented.
- The six tool PDFs are produced by reusing `TenantOpsReportToolbar` in a compact row variant (`status='all'`, no search) rather than re-calling the RPC by hand.
- Word Report handler currently lives in `TenantOpsHub`; it is lifted into a tiny shared hook (`useTenantOpsWordReport`) used by both the hub button and the Extract row, so behaviour stays identical in both places.
- Permissions: the panel renders inside the existing Tenant Ops route, all exports go through the same RPCs/edge functions and RLS as today; nothing is loosened.
- Responsive: one-column stacked rows on mobile, two columns from `sm`, `min-w-0` + truncation on names, action buttons full-width on mobile — matching the existing hub-entry cards.
- States: existing `Loader2` spinners on the triggering button, existing `sonner` toasts for success/failure, disabled while another extract runs.

## Out of scope
No new reports, no new queries, no new formats, no scheduling, no changes to existing report pages beyond exporting their handlers.
