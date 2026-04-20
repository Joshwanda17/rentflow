

## Plan: Export All Advance Payments as Single Consolidated PDF

### Where
Add a second button **"Export All Payments"** next to the existing **"Export PDFs"** in the header of `CFOAdvancesManager.tsx` (Advances tab on CFO Dashboard).

### What it does
Instead of one PDF per agent, generate **ONE consolidated PDF** containing every payment/deduction across all advances in the current filter view — combined into a single chronological table.

### PDF contents
1. **Header** — Welile branding, "Consolidated Advance Payments Report", generation date, filter applied (`all`/`active`/`completed`/`overdue`)
2. **Top-line summary**:
   - Total advances covered
   - Total agents covered
   - Total principal issued
   - Total interest accrued
   - Total deducted (sum of all `amount_deducted` from `agent_advance_ledger`)
   - Total outstanding
3. **Single unified payments table** (sorted by date desc) with columns:
   - Date
   - Agent name
   - Advance ID (short)
   - Opening balance
   - Interest accrued
   - Amount deducted
   - Closing balance
   - Status
4. **Footer** — page numbers, audit reference

### Tech approach
- New helper in **`src/lib/agentAdvancePdfExport.ts`**: `exportConsolidatedPayments(advances)` 
- Reuses existing `jsPDF` + `jspdf-autotable` deps (no new packages)
- Bulk-fetches `agent_advance_ledger` for all advance IDs via single `.in()` query (already done in existing helper — extract pattern)
- Joins agent name from `advances[].profiles.full_name`
- Single download: `advance-payments-consolidated-{filter}-{YYYY-MM-DD}.pdf`
- Audit log: `action_type: 'cfo_advance_payments_export'`

### UX
- Button label: **"Export All Payments"** with `FileText` icon
- Disabled when `filtered.length === 0` or while exporting
- Toast: `"Generating consolidated payments report..."` → `"Downloaded {filename}"`
- Respects current tab filter

### Files
**Modified**
- `src/lib/agentAdvancePdfExport.ts` — add `exportConsolidatedPayments()` function (keeps existing `exportAdvanceStatements` untouched)
- `src/components/cfo/CFOAdvancesManager.tsx` — add second button + handler

### Out of scope
- Excel/CSV export (PDF only, matching existing pattern)
- Date range picker (always exports full history of filtered advances)
- Touching the existing per-agent export

### Expected outcome
CFO clicks **"Export All Payments"** → one PDF downloads showing every deduction ever recorded across all visible advances in a single chronological table — useful for auditing total cash flow recovered from advances at a glance.

