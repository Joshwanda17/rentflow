

# Tappable KPI Card Breakdowns — CFO Treasury Header

## Problem
The 6 KPI cards (Platform Cash, User Wallets, Platform Earnings, Cash In Today, Cash Out Today, Net Cash Today) show summary values but tapping them doesn't reveal any breakdown detail.

## Solution
Add a bottom-sheet / expandable drawer (using a Dialog/Sheet) that opens when each KPI card is tapped, showing a categorized breakdown of the number displayed.

### File Changes

#### 1. New component: `src/components/cfo/KPIBreakdownSheet.tsx`
A reusable Sheet component that accepts a title, total value, and an array of breakdown line items `{ label, value, icon?, color? }`. Renders a clean list with the total at the bottom.

#### 2. Update: `src/components/cfo/CFOOverviewDashboard.tsx`
- Add `useState` to track which KPI sheet is open (e.g. `activeBreakdown: string | null`)
- Each KPI card's `onClick` opens the corresponding sheet
- Pass breakdown data from existing hook data:

| Card | Breakdown Items |
|------|----------------|
| **Platform Cash** | MTN balance, Airtel balance, Bank balance, Cash balance (from `channelBalances.channels`) |
| **User Wallets** | Total wallet balance (from `liabilities.tenantFunds`), Pending withdrawals, Agent payables, ROI obligations |
| **Platform Earnings** | Total revenue, Total expenses, Net profit (from `revenue`) |
| **Cash In Today** | Category breakdown of today's inflows (from `todayCashFlow`) |
| **Cash Out Today** | Category breakdown of today's outflows (from `todayCashFlow`) |
| **Net Cash Today** | Cash in, Cash out, Net (summary from `todayCashFlow`) |

#### 3. Update: `src/hooks/useCFOOverviewData.ts`
Extend the `todayCashFlow` query to return category-level breakdowns for today's inflows and outflows (group by `category` where `created_at` is today), so the Cash In/Out/Net sheets show meaningful detail instead of just the totals.

### UX
- Uses the existing `Sheet` component (bottom drawer on mobile, side sheet on desktop)
- Each breakdown row shows label + formatted UGX amount
- Total row at bottom with bold styling
- Smooth open/close, no page navigation

### No backend changes needed
All data already exists in the hook — just needs to be passed through to the sheet.

