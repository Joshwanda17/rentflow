## Add "Download Daily Report" button to Agent Dashboard

Add a button on the agent dashboard that generates a PDF showing **that agent's** daily performance — same shape as the company-wide report just delivered, but scoped to the logged-in agent and broken down **per active tenant** (row-per-tenant), since a single agent's report makes more sense as a tenant-level breakdown than a single summary row.

### Where
- `src/components/dashboards/AgentDashboard.tsx` — place the button next to `AgentDailyOpsCard` (top of dashboard) as a compact action button: "Download Today's Report (PDF)".

### What the PDF contains
**Header**
- Agent name + phone, report date (default = today), generation timestamp.
- Summary line: Active tenants · Expected today · Collected today · Collection rate % · Principal company has paid · Outstanding.

**Table — one row per active tenant**
| # | Tenant Name | Phone | Rent (Principal) | Daily Expected | Collected Today | Status (Paid/Pending) | Total Repaid | Outstanding |

Totals row at the bottom.

Plus an optional "Collections today" sub-table listing each `agent_collections` row (time, tenant, amount, method, TID).

### How (frontend only)
1. New helper `src/lib/agentDailyReportPdf.ts` using `jspdf` (already used by `agentPerformanceReportPdf.ts`) — generate landscape A4, save via `pdf.save()`.
2. New hook/loader that fetches for the logged-in agent on click:
   - `rent_requests` where `agent_id = me` and `status IN (funded, disbursed, repaying, active, approved)` joined to tenant `profiles`
   - `agent_collections` where `agent_id = me` and `created_at` within selected date
3. Button component `AgentDailyReportButton.tsx` in `src/components/agent/`. Shows a small date picker (defaults to today, last 7 days selectable) + Download button with loading state and toast on success/error.
4. Wire into `AgentDashboard.tsx` near the daily ops card.

### Out of scope
- No backend / edge function changes.
- No new tables, no RLS changes (existing RLS already lets agents read their own rent_requests + collections).
- No changes to the company-wide PDF already delivered.

### Confirm before I build
- **Row granularity**: per-tenant breakdown (recommended) — agree?
- **Date picker**: today + last 7 days, or just today?
