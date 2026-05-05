## Goal
Align the Agent Performance Report with the 6 required fields from your checklist:
1. Best and Worst performance
2. Daily Collection rates (each collection per person)
3. Agent activities
4. Daily Commissions paid out
5. Daily rent paid out
6. Conversion percentages

## Current state (already in `src/components/executive/AgentPerformanceReport.tsx`)
- Active Tenants, Daily Portfolio, Expected Weekly, Collected, Efficiency, Gap
- Payments count, % Paid
- 10% Commission, Interest, Wallet Total
- Status badge by efficiency
- KPI strip (6 cards), filters, PDF download

## What's missing vs the checklist

| # | Required | Status | Action |
|---|----------|--------|--------|
| 1 | Best and Worst performance | Implicit (sorted) | Add explicit **"Top Performer" + "Needs Attention"** spotlight cards above the table |
| 2 | Daily Collection rates per person | Aggregated only | Add a **"Daily Avg / Agent"** column = collected ÷ active days; plus per-agent daily-trend sparkline |
| 3 | Agent activities | Payments count exists | Rename "Payments (Count)" → **"Activities"** and include collections + deposits + visits in one tally |
| 4 | Daily Commissions paid out | Period total only | Add **Daily Commission Avg** column + a top-strip KPI "Today's Commissions Paid" |
| 5 | Daily rent paid out | Not present | Add **"Rent Paid Out (Daily)"** = sum of `landlord_payouts` (or rent disbursement) attributed to each agent's tenants for the day; KPI for today's total |
| 6 | Conversion percentages | Efficiency + %Paid exist | Add explicit **"Conversion %"** column = tenants_paid ÷ tenants_total over selected window, displayed as a clear column with color-coded bar |

## Implementation steps

1. **Add Best/Worst spotlight (top of report)**
   - Two cards: highest-efficiency agent (green) + lowest non-zero efficiency agent (red), with name, collected, efficiency.

2. **New columns in the table**
   - `Activities` (renamed from Payments) — keep count of all field actions per agent in window.
   - `Daily Avg Collection (UGX)` — collected / number of days in window.
   - `Daily Commission (UGX)` — commission / days in window.
   - `Rent Paid Out (UGX)` — pulled from `landlord_payouts` (or equivalent rent disbursement table) joined by `agent_id` of the related rent_request.
   - `Conversion %` — tenants_paid / tenants_total, color-coded.

3. **New KPI strip cards** (additions to existing 6)
   - Today's Commissions Paid Out (UGX)
   - Today's Rent Paid Out (UGX)
   - Top Conversion % (from best agent)

4. **Data fetch additions**
   - Pull `landlord_payouts` (or `disbursements` — verify exact table during implementation) within window, attributed to agent via `rent_request_id → agent_id` map (already built in current code).
   - Compute "days in window" from the selected preset to power daily averages.

5. **PDF export update**
   - Extend `agentPerformanceReportPdf.ts` to include the new columns and the spotlight section.

## Out of scope
- No schema changes — all data exists in `agent_collections`, `repayments`, `tenant_merchant_payments`, `agent_earnings`, `rent_requests`, and the rent disbursement table.
- No new RPCs unless `landlord_payouts` doesn't exist in the schema, in which case I'll confirm with you before proceeding.

## Files to edit
- `src/components/executive/AgentPerformanceReport.tsx` — spotlight, KPI additions, new columns, daily averages, conversion column.
- `src/lib/agentPerformanceReportPdf.ts` — match new columns in PDF.
