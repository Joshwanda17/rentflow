

## Add Column Header Filters to Agent Performance Report

### What you'll get

Each column in the Agent Performance table gets a filter control in its header, letting you narrow down agents by any combination of metrics without leaving the table.

### Filters per column

| Column | Filter type |
|---|---|
| Agent Name | Text search (contains) |
| Active Tenants | Min / Max number |
| Daily Portfolio (UGX) | Min / Max number |
| Expected Weekly (UGX) | Min / Max number |
| Collected (UGX) | Min / Max number |
| Efficiency (%) | Min / Max number |
| Gap (UGX) | Min / Max number |
| Payments (Count) | Min / Max number |
| % Paid | Min / Max number |
| 10% Commission (UGX) | Min / Max number |
| 0.5% Interest (UGX) | Min / Max number |
| Total Wallet (UGX) | Min / Max number |
| Status | Multi-select (Excellent / Good / Moderate / Low / Critical) |

### UX

- A small funnel icon sits next to each column title. Click it → popover opens with the relevant control (text input, min/max numeric pair, or status checkboxes).
- Active filters show a colored dot on the funnel icon and an "X agents shown / Y total" counter above the table.
- A **Clear all filters** button appears when any filter is active.
- Filters are AND-combined across columns; the totals row at the bottom recomputes from the filtered set so you can see "what does this slice of agents look like."
- Filter state lives in component state (resets on page reload — no URL persistence to keep it simple). Sorting (existing) continues to work on the filtered set.

### Technical details

**File touched (1):** `src/components/executive/AgentPerformanceReport.tsx`

- Add a `filters` state object: `{ name: string, status: Set<Status>, ranges: Record<numericKey, {min?: number, max?: number}> }`.
- Build a `filteredRows = useMemo(...)` derived from the existing `rows`, applied before the existing sort step.
- Recompute the totals row from `filteredRows` (currently computed from all rows) so footer reflects the visible slice.
- New small subcomponents inside the same file:
  - `<HeaderFilter>` — wraps a column title with a `Popover` (shadcn) and funnel icon (`lucide-react` `Filter`).
  - `<NumericRangeFilter>` — two inputs (min, max) with Apply/Clear.
  - `<TextFilter>` — single input with debounced apply.
  - `<StatusFilter>` — checkbox list of the 5 statuses.
- Add a "X of Y agents" indicator + "Clear all filters" button in the existing toolbar above the table.
- The PDF export (`agentPerformanceReportPdf.ts`) already receives a `rows` array — we'll pass `filteredRows` so exports respect the active filters too.

No DB, RPC, or schema changes. No new dependencies (Popover, Input, Checkbox, Button, Filter icon are all already in use).

