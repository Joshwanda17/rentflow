

# Reorder CFO Dashboard Tabs

## Current Order
Overview → ROI Requests → Cash Position → Channels → P&L → Disbursements → Statements → Solvency → Payouts → Requisitions → Collections → Rankings → Investments → Reconcile → Ledger

## New Order (per your request)
1. **Overview** (existing)
2. **ROI Requests** (existing `roi`)
3. **Rent Payouts** (existing `payouts`)
4. **Financial Agents** (existing `requisitions` — CFOAgentRequisitions)
5. **Financial Statements** (existing `statements`)
6. **Solvency & Buffer** (existing `solvency`)
7. **Reconciliation** (existing `reconciliation`)
8. **General Ledger** (existing `ledger`)
9. **Commission Payouts** — already inside Payouts tab, will keep as sub-content
10. **Withdrawals** — part of payouts, gets its own tab
11. **Investments** (existing `investments`)
12. **Rent Collections** (existing `collections`)
13. **Agent Rankings** (existing `rankings`)
14. **Cash Position** (existing `cash`)
15. **Channels** (existing `channels`)
16. **P&L** (existing `revenue`)
17. **Disbursements** (existing `disbursements`)

## File Change

### `src/pages/CFODashboard.tsx`
- Reorder the `tabs` array so the first four are: Overview, ROI Requests, Rent Payouts (renamed from "Payouts"), Financial Agents (renamed from "Requisitions")
- Remaining tabs follow in the order matching the reference sidebar image
- No logic changes — just array reordering and label renaming

