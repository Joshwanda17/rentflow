

## Plan: Per-Category Detailed Export Buttons on CFO Revenue/Expense Dashboard

### Where
`src/components/cfo/RevenueExpenseDashboard.tsx` — the "Revenue Breakdown" and "Expense Breakdown" cards under `/cfo-dashboard`.

### What
Below each pie slice, render a clickable list of categories. Each row shows the category name, total amount, and a small **Download** button. Clicking exports a **detailed PDF report** of every `general_ledger` entry under that category for the last 30 days.

### Per-category PDF contents
1. **Header** — Welile branding, category name, period (last 30 days), generated timestamp
2. **Summary cards** — total amount, entry count, daily average, top counterparty
3. **Daily trend mini-table** — date · entry count · daily total
4. **Detailed transactions table** (sorted by date desc):
   - Date · Reference ID · Direction · Amount · Linked Party · Description · Account · Classification
5. **Footer** — page numbers + audit reference

### Tech approach
- New helper `src/lib/categoryReportExport.ts` exporting `exportCategoryReport(category, label, type: 'revenue'|'expense')`
- Fetches `general_ledger` filtered by `category` + `transaction_date >= 30d ago` + `ledger_scope='platform'`
- Uses existing `jsPDF` + `jspdf-autotable` (no new deps)
- Filename: `{revenue|expense}-{category}-{YYYY-MM-DD}.pdf`
- Audit log: `action_type: 'cfo_category_report_export'`, `record_id: category`

### UX
- Compact list rows beneath each pie chart with category label, formatted UGX total, and a `Download` icon button
- Loading spinner per-row while exporting
- Toast: "Generating {label} report..." → "Downloaded {filename}"
- Plus a single **"Export All Categories"** button per side (revenue/expense) that bundles all categories into one combined PDF

### Files
**Modified**
- `src/components/cfo/RevenueExpenseDashboard.tsx` — add category list + export buttons under each pie

**New**
- `src/lib/categoryReportExport.ts` — `exportCategoryReport()` + `exportAllCategoriesReport()` helpers

### Out of scope
- CSV/Excel format (PDF only, matches existing `agentAdvancePdfExport.ts` pattern)
- Date range picker (fixed 30d window matching the dashboard)
- Changing the pie charts themselves
- Other dashboards (Ledger Health, KPI Breakdown — these already have their own exports)

### Expected outcome
CFO sees each revenue/expense category listed under the pie with its total and a download button → one click produces a polished PDF audit trail for that single category, ready for board packs or external auditors.

