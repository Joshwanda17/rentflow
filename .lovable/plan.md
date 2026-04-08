

# CFO Dashboard Overview Redesign

## Goal
Replace the current flat list of components on the CFO overview tab with a structured, color-coded financial command center following the 6-section layout hierarchy.

## Current State
The overview tab renders 9 components in a flat `space-y-4` stack: `PlatformVsWalletSummary`, `ChannelBalanceTracker`, `AgentPerformanceRankings`, `PendingPortfolioTopUps`, `WalletRetractionsFeed`, `CFOReceivablesTracker`, `FinancialOverview`, `ListingBonusApprovalQueue`, `RentPipelineQueue`. No visual hierarchy or section separation.

## What Changes

### 1. New component: `src/components/cfo/CFOOverviewDashboard.tsx`
A single orchestrator component that replaces the current default case in the CFO dashboard. It contains 7 sections:

**Section 0 — Sticky Header KPI Bar (4 cards)**
- Total Cash (blue) — sum of all channel balances (deposits - withdrawals)
- Total Liabilities (yellow) — sum of all wallet balances (user funds owed)
- Platform Revenue (green) — net platform earnings from platform-scope ledger
- Solvency Ratio (dynamic color) — Total Cash / Total Liabilities as %
- Sticky positioning with `sticky top-0 z-10 bg-background`

**Section 1 — Cash & Liquidity (blue border-left accent)**
- Large "Total Cash" hero number
- Channel breakdown grid: MTN, Airtel, Bank, Cash with icons
- Available Cash vs Restricted Cash (user funds) sub-row
- Reuses data from `ChannelBalanceTracker` query logic

**Section 2 — Liabilities / User Funds (yellow accent)**
- Grid of 5 cards: Tenant Funds, Agent Payables, Landlord Payables, ROI Obligations, Pending Withdrawals
- Each shows amount, label, % of total liabilities
- Horizontal stacked bar showing liability breakdown
- Data from wallets table (role-filtered) + withdrawal_requests + investor ROI

**Section 3 — Platform Earnings (green accent)**
- 4 KPI cards: Total Revenue, Fees Earned, Net Profit, Growth %
- Small 7-day trend sparkline chart below
- Reuses platform-scope ledger query from `PlatformVsWalletSummary`

**Section 4 — Money Flow (purple accent)**
- 3 KPI cards: Total Inflows, Total Outflows, Net Flow
- Area chart: deposits vs withdrawals over last 30 days
- Data from deposit_requests and withdrawal_requests

**Section 5 — Risk & Reconciliation (red accent)**
- 4 channel status cards: MTN, Airtel, Bank, Cash — each shows System vs Actual, Variance, status badge (OK/Warning/Critical)
- Large solvency indicator bar
- Reuses reconciliation logic from `CFOReconciliationPanel` and buffer metrics from `BufferAccountPanel`

**Section 6 — Operations (grey accent, bottom)**
- Two-column layout: Left = Top Agents (compact rankings), Right = Recent Activity (retractions, approvals)
- Reuses `AgentPerformanceRankings compact` and `WalletRetractionsFeed compact`

### 2. Update `src/pages/cfo/Dashboard.tsx`
- Replace the default case content with `<CFOOverviewDashboard />`
- Keep all other sidebar tab cases unchanged

### 3. Sidebar remains unchanged
- The left-hand sidebar (`ExecutiveDashboardLayout` + `executiveSidebarConfig`) stays exactly as-is

### 4. Data hooks
- Create `src/hooks/useCFOOverviewData.ts` — a single hook that fetches all overview data in parallel using React Query:
  - Channel balances (deposits/withdrawals by provider)
  - Wallet totals (grouped by role for liability breakdown)
  - Platform-scope ledger (revenue/costs)
  - Pending withdrawals count/amount
  - ROI obligations from investor_portfolios
  - 30-day deposit/withdrawal trend data
- Each query uses `staleTime: 300_000` (5 min) to minimize load

### 5. Interaction design
- Hover on any KPI card shows tooltip with breakdown, source, last updated
- Click on section cards navigates to the relevant sidebar tab (e.g., clicking Liabilities goes to `solvency` tab, clicking a channel goes to `reconciliation`)

## Visual Design
- Each section wrapped in a Card with a colored left border (4px): blue, yellow, green, purple, red, grey
- Section titles use consistent typography: `text-lg font-bold` with matching color icon
- Numbers: `text-2xl font-bold font-mono` for hero values, `text-sm text-muted-foreground` for labels
- Solvency ratio badge: green >= 100%, yellow 80-99%, red < 80%

## Files Created/Modified
| File | Action |
|------|--------|
| `src/components/cfo/CFOOverviewDashboard.tsx` | Create — main overview layout |
| `src/hooks/useCFOOverviewData.ts` | Create — consolidated data hook |
| `src/pages/cfo/Dashboard.tsx` | Modify — swap default case to use new component |

## What stays the same
- Left sidebar (all tabs, config, layout)
- All other tab views (roi-requests, statements, reconciliation, etc.)
- Existing components remain available for their dedicated tabs

