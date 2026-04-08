

# CFO Dashboard — Complete Redesign with Assets Section

## Summary
Rebuild the CFO Overview Dashboard to match the 8-section financial command center layout. The key addition is a new **Section 2: Assets (Receivables)** between Cash & Liquidity and Liabilities, and a restructured **Section 5: Cash Flow Engine** broken down by purpose.

## Changes

### 1. `src/hooks/useCFOOverviewData.ts` — Add receivables + cash flow by purpose

**New query: `receivables`**
- Tenant outstanding: sum of `accumulated_debt` from `subscription_charges` where `status = 'active'`
- Advances outstanding: sum of `outstanding_balance` from `agent_advances` where `status = 'active'`
- Returns `tenantOutstanding`, `advancesOutstanding`, `totalReceivables`

**Update `revenue` query:**
- Add `totalExpenses` (rename from `totalCosts` for clarity)
- Separate fees earned from gross revenue if categories allow

**New query: `cashFlowByPurpose`**
- Query `general_ledger` (platform scope) grouped by category to produce:
  - Cash In: Partner Funding, Tenant Repayments
  - Cash Out: Rent Payments, ROI Payouts, Advances
  - Net Cash Movement
- Reuse the existing 30-day trend from `moneyFlow`

**Update solvency formula:**
- Return `totalReceivables` so the dashboard can compute `(Cash + Receivables) / Liabilities`

### 2. `src/components/cfo/CFOOverviewDashboard.tsx` — Full rebuild

**Section 0 — KPI Bar (4 cards):**
- Total Cash (blue)
- Total Receivables (purple) — NEW
- Total Liabilities (yellow)
- Solvency Ratio: `(Cash + Receivables) / Liabilities` — updated formula

**Section 1 — Cash & Liquidity (blue):**
- Keep as-is: Total Cash hero, channel grid (MTN/Airtel/Bank/Cash), Available vs Restricted
- Add red alert if any channel balance is negative

**Section 2 — Assets / Receivables (purple) — NEW:**
- Two cards: Tenant Outstanding, Advances Outstanding
- Total Receivables hero number
- Optional aging placeholder (0-30, 30-60, 60+ days) shown as muted text for future implementation

**Section 3 — Liabilities (yellow):**
- Keep existing: 5-card grid + breakdown bar
- No changes

**Section 4 — Platform Earnings (green):**
- 4 cards: Revenue, Fees, Expenses, Net Profit
- Keep 7-day trend chart

**Section 5 — Cash Flow Engine (indigo) — RESTRUCTURED:**
- Two sub-sections: Cash In (Partner Funding, Tenant Repayments) and Cash Out (Rent Payments, ROI Payouts, Advances)
- Net Cash Movement hero number
- Keep the existing 30-day area chart (inflows vs outflows)

**Section 6 — Risk & Control (red):**
- Section A: Channel reconciliation cards (keep existing)
- Section B: Solvency Breakdown — Cash, Receivables, Liabilities, Coverage %
- Section C: Alerts — negative balances, low liquidity warnings

**Section 7 — Operations (grey):**
- Keep existing: Top Agents left, Recent Activity right

### 3. Color system update
| Section | Border accent | Icon color |
|---------|--------------|------------|
| Cash | blue-500 | blue-500 |
| Assets | purple-500 | purple-500 |
| Liabilities | yellow-500 | yellow-500 |
| Revenue | emerald-500 | emerald-500 |
| Cash Flow | indigo-500 | indigo-500 |
| Risk | red-500 | red-500 |
| Operations | muted | muted |

### Files Modified
| File | Action |
|------|--------|
| `src/hooks/useCFOOverviewData.ts` | Add receivables query, cash flow by purpose, update returns |
| `src/components/cfo/CFOOverviewDashboard.tsx` | Full rebuild with 8 sections |

No database changes needed — all data comes from existing tables (`subscription_charges`, `agent_advances`, `general_ledger`, `deposit_requests`, `withdrawal_requests`, `wallets`, `investor_portfolios`, `agent_commission_payouts`).

