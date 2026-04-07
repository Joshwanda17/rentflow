

# Add "Advances" Section to CFO Dashboard

## Overview
Add a new sidebar section labeled "Advances" to the CFO dashboard menu, linking to an inline tab that manages advances for both agents and staff. The page will use the existing `agent_advances` table and calculation logic, with support for variable access fee rates (33%, 28%, or lower).

## Changes

### 1. Add "Advances" menu section to sidebar config
**File: `src/components/layout/executiveSidebarConfig.ts`**
- Add a new section after "Disbursements" in the `cfo` config:
  ```
  { title: 'Advances', items: [
    { label: 'Manage Advances', icon: Banknote, id: 'advances' }
  ]}
  ```

### 2. Create `CFOAdvancesManager` component
**File: `src/components/cfo/CFOAdvancesManager.tsx`**
- A dedicated component embedded in the CFO dashboard (not a separate route)
- Features:
  - **Summary cards**: Total issued, total outstanding, overdue exposure, accrued interest
  - **Filter tabs**: All / Active / Completed / Overdue
  - **Advances table**: Lists all agent and staff advances with name, principal, outstanding balance, status, risk indicator, cycle days
  - **Issue Advance sheet**: Reuse existing `IssueAdvanceSheet` for creating new advances, with a **recipient type selector** (Agent / Staff)
  - **Access fee calculator**: Inline calculator using the formula `accessFee = amount × ((1 + monthlyRate)^(days/30) − 1)` with a dropdown to select rate (33%, 28%, or custom lower)
  - **Click-through**: Row click navigates to `/agent-advances/:id` for detail view
- Queries `agent_advances` joined with `profiles` for display

### 3. Wire up in CFO Dashboard
**File: `src/pages/cfo/Dashboard.tsx`**
- Add `case 'advances': return <CFOAdvancesManager />;` to the `renderContent` switch
- Import the new component

### Technical Details
- Reuses existing `agent_advances` table — no DB migration needed
- Reuses `agentAdvanceCalculations.ts` for formatting and compound math
- Reuses `rentCalculations.ts` `calculateAccessFee` for variable-rate fee computation
- Staff advances use the same table (agent_id field can reference any user)

