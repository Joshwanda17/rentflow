

## Plan: Export Per-Agent Advance Payment History as PDF

### Where it goes
Add an **"Export PDFs"** button to the header of `CFOAdvancesManager.tsx` (right next to "Issue Advance"), accessible from CFO Dashboard → Advances tab.

### What it exports
For every agent who has at least one advance in the current filter view (`all`/`active`/`completed`/`overdue`), generate **one PDF per agent** containing:

1. **Header** — Welile branding, "Agent Advance Statement", generation date, CFO export tag
2. **Agent block** — full name, phone
3. **Summary table** — totals across all their advances: principal, access fee, fee collected, outstanding, interest accrued, # of advances
4. **Per-advance section** (one per advance the agent holds), each showing:
   - Advance metadata: ID, status, issued date, expires, cycle days, monthly rate, principal, access fee, total payable
   - **Payment history table** from `agent_advance_ledger` (date, opening balance, interest accrued, amount deducted, closing balance, deduction status) — this is the daily deduction record
   - Top-ups from `agent_advance_topups` if any
5. **Footer** — page numbers, audit reference

### Output
- Single agent → opens/downloads one PDF
- Multiple agents → bundles as a **ZIP** (`agent-advances-export-YYYY-MM-DD.zip`) using `jszip` so the operator gets one file
- File naming: `advance-statement-{AgentName}-{date}.pdf`

### Tech approach
- Use **jsPDF + jsPDF-autoTable** (lightweight, client-side, already common in the stack — will confirm; if absent, add to deps). Avoids a server roundtrip and the user's request explicitly was a UI export button.
- Use **jszip** for the multi-agent bundle
- Group advances by `agent_id`, fetch each advance's `agent_advance_ledger` rows in parallel (`Promise.all`)
- Show progress toast: "Generating 12 PDFs..." → "Downloaded"
- Disabled state while generating; respects current tab filter (export only what's visible)

### UX details
- Button label: **"Export PDFs"** with `Download` icon
- Disabled when `filtered.length === 0` or while generating
- Toast: `"Exporting {n} agent statement(s)..."` → `"Downloaded {filename}"`
- If only one agent in filter → direct PDF download (no zip)
- Audit log entry written: `action_type: 'cfo_advance_export'`, reason auto-filled with count + filter

### Files
**Modified**
- `src/components/cfo/CFOAdvancesManager.tsx` — add button + export handler

**New**
- `src/lib/agentAdvancePdfExport.ts` — pure helper: `generateAdvancePdf(agent, advances, ledgerByAdvance, topupsByAdvance)` returns a `Blob`; `exportAdvanceStatements(advances)` orchestrates fetch + zip + download

### Out of scope
- Server-side PDF generation / edge function (not needed at this volume)
- Email delivery of statements (can be a follow-up suggestion)
- Customizing date ranges (always exports the full history)

### Expected outcome
CFO clicks **Export PDFs** in the Advances tab → progress toast → browser downloads either a single PDF (1 agent) or a ZIP of per-agent statements (multiple agents), each with that agent's full daily payment history from `agent_advance_ledger` plus advance summary and any top-ups.

