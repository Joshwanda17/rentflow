

## Agent Allocation & Tenant Repayment Holistic Report

### Goal
Add a single, deep-dive report — **"Agent Allocations & Tenant Repayment"** — that lives in BOTH **Agent Ops** and **Tenant Ops**, showing for every agent:
- Every tenant they've allocated funds to (start date, rent given, daily amount, duration)
- How each tenant is paying back (paid, outstanding, % paid, last payment date, days overdue, on-track flag)
- Per-agent rollups (total allocated, total repaid, collection rate, on-time %, default rate, status badge)
- Drill-down: click an agent → expanded list of their tenants

Plus a landscape PDF export (one section per agent + a master summary page).

### Where it lives

1. **New component**: `src/components/executive/AgentAllocationReport.tsx`
2. **New PDF generator**: `src/lib/agentAllocationReportPdf.ts`
3. **Wire into both dashboards**:
   - `src/components/executive/AgentOpsDashboard.tsx` → add tab **"Allocations & Repayment"**
   - `src/components/executive/TenantOpsDashboard.tsx` → add tab **"Agent Allocations"**
   - Same component, identical data — both ops teams see the same truth.

### Data sources (read-only)
- `rent_requests` — agent_id, tenant_id, start_date, rent_amount, daily_payment, duration_days, total_repayment, amount_repaid, status, created_at
- `agent_collections` — per-tenant payment events (amount, created_at) → for last payment date, payment count, on-time signal
- `profiles` — agent name & phone, tenant name & phone
- Pagination: paginated loop up to 20,000 rows (same pattern already used in `AgentPerformanceReport.tsx`)
- **Filter**: only agents with `tenants_total > 0` (matches existing performance-report rule)

### Per-tenant row shows
| # | Tenant | Phone | Start | Rent Given | Daily | Days | Paid | Outstanding | % Paid | Last Payment | Days Overdue | Status |

**Status logic** (per tenant):
- `On Track` — paid ≥ expected-to-date AND last payment within 3 days
- `Slow` — paid 50–99% of expected-to-date
- `Behind` — paid < 50% of expected-to-date
- `Default Risk` — no payment in 14+ days AND outstanding > 0
- `Completed` — outstanding ≤ 0

Where `expected-to-date = daily_payment × min(days_elapsed, duration_days)`.

### Per-agent rollup card shows
- Agent name + phone, tenant count
- Total Allocated · Total Repaid · Outstanding · Collection Rate %
- On-Time % (tenants in `On Track` / total)
- Default Rate (tenants in `Default Risk` / total)
- Average days-to-first-payment
- Status badge: **Excellent ≥85%**, **Good 65–84%**, **Watch 40–64%**, **Critical <40%**

### UI layout
```text
┌─ Header: "Agent Allocations & Tenant Repayment" + [Range select] [Download PDF] ┐
├─ KPI strip: Agents · Tenants · Allocated · Repaid · Collection Rate ─────────────┤
├─ Agent rows (accordion, sorted by collection rate desc)                          │
│   ▼ Agent A — 12 tenants — UGX 4.2M / 6.0M (70%) · 8 on-track · [Good]           │
│      └─ Tenant table (12 rows, all the columns above)                            │
│   ▶ Agent B — 7 tenants — …                                                       │
└──────────────────────────────────────────────────────────────────────────────────┘
```
- Desktop: accordion table.
- Mobile (≤640px): collapsed agent cards; expand → stacked tenant cards.

### PDF export (`agentAllocationReportPdf.ts`)
- Landscape A4, color-coded statuses (matches on-screen palette)
- **Page 1**: Master summary — one row per agent (name, tenants, allocated, repaid, rate, on-time%, default%, status)
- **Pages 2…N**: One section per agent — agent header band + full tenant table
- Footer: generated date, page X of Y

### Range filter
Same presets already in `AgentPerformanceReport`: Last 7 Days · This Week · Last Week · This Month · **All Time** (new option, important for repayment view because some plans span months).

### Technical notes (for engineers)
- Reuse pagination pattern from `AgentPerformanceReport.tsx` (paged loops, 1k page size, 20k cap).
- Profiles fetched in batches of 50 by id — same hygiene already in the codebase.
- Status helpers live alongside the component (small, pure functions). No DB migration. No RLS change.
- TanStack Query key: `['agent-allocation-report', startISO, endISO]`, `staleTime: 60_000`.
- PDF: dynamic `import('jspdf')` to keep initial bundle lean, same as existing PDF generators.
- No new edge functions, no schema changes, no role/permission changes.

### Verification
1. Open **Agent Ops → Allocations & Repayment** → accordion lists every agent with ≥1 tenant.
2. Expand an agent → see every tenant they've allocated to with paid/outstanding/status.
3. Open **Tenant Ops → Agent Allocations** → same data, same view.
4. KPI strip totals match TOTALS in PDF master page.
5. Click **Download PDF** → master page + per-agent breakdown pages render cleanly in landscape.
6. Switch range → table & PDF refresh accordingly.
7. Test on mobile (≤640px) → cards stack, no horizontal scroll.

