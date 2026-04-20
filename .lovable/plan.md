

The user is right — I claimed the buttons are on an "Overview tab" but looking at `CFODashboardPage`, the default view (when `activeTab === 'overview'`) renders `<CFOOverviewDashboard onTabChange={setActiveTab} />`, NOT `RevenueExpenseDashboard`. So the export buttons I added to `RevenueExpenseDashboard` are not actually rendered anywhere on the CFO dashboard.

Let me verify by checking where RevenueExpenseDashboard is used.

I need to check:
1. Is `RevenueExpenseDashboard` imported/rendered anywhere in CFO dashboard?
2. If not, where should it live?

Looking at Dashboard.tsx imports — `RevenueExpenseDashboard` is NOT imported. So the component with my export buttons is orphaned on the CFO dashboard.

It's likely rendered inside `CFOOverviewDashboard` component. Need to verify that, but regardless — the fix is either:
- Add a new sidebar tab "Revenue & Expenses" that renders `RevenueExpenseDashboard`, OR
- Confirm it's inside `CFOOverviewDashboard` and just tell the user where to scroll

## Plan: Surface the export buttons on CFO Dashboard

### Step 1 — Verify where `RevenueExpenseDashboard` actually renders
Check `CFOOverviewDashboard.tsx` to see if it embeds `RevenueExpenseDashboard`. The CFO landing screen (when you open `/cfo-dashboard`) IS the overview — it's just not labeled as a tab.

### Step 2 — Two outcomes

**If RevenueExpenseDashboard IS embedded in `CFOOverviewDashboard`:**
- No code change needed
- Just tell user: "Land on `/cfo-dashboard` → scroll down on the default landing screen until you see the Revenue Breakdown / Expense Breakdown pie cards"

**If it is NOT embedded anywhere (likely):**
- Add a new sidebar entry **"Revenue & Expenses"** under the Treasury / Reporting section in `executiveSidebarConfig.ts`
- Add a new case in `Dashboard.tsx` switch: `case 'revenue-expenses': return <RevenueExpenseDashboard />;`
- Import `RevenueExpenseDashboard` at the top of `Dashboard.tsx`
- Result: CFO clicks "Revenue & Expenses" in the left sidebar → sees the two pie cards with download buttons per category + "Export All" button

### Files to touch (worst case)
- `src/pages/cfo/Dashboard.tsx` — import + new switch case
- `src/components/layout/executiveSidebarConfig.ts` — new sidebar item under CFO

### Out of scope
- No new exports/PDF logic (already built in `categoryReportExport.ts`)
- No changes to `RevenueExpenseDashboard` itself

Will investigate `CFOOverviewDashboard.tsx` first before making the edit, so I only add the sidebar tab if the dashboard genuinely doesn't already render it.

