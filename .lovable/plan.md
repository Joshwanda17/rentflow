

# Financial Agent Requisition Access from Agent Dashboard

## Problem
When a CFO assigns an agent as a Financial Agent (via the `financial_agents` table), that agent has **no way to access the requisition form** from their own dashboard. The `AgentRequisitionForm` currently only exists inside the Financial Ops Command Center — a staff-only page.

## Solution
Add a "Financial Agent" section to the agent dashboard that appears **only** when the logged-in agent exists in the `financial_agents` table with `is_active = true`. This section gives them access to submit fund requisitions and view their requisition history.

## Changes

### 1. New Hook: `src/hooks/useIsFinancialAgent.ts`
A small hook that queries `financial_agents` to check if the current user is an active financial agent.
```
Returns: { isFinancialAgent: boolean, loading: boolean }
```

### 2. New Component: `src/components/agent/FinancialAgentSection.tsx`
A collapsible section/sheet that wraps the existing `AgentRequisitionForm` component. Shows:
- A banner/card: "You are a Financial Agent — Submit fund requisitions here"
- The `AgentRequisitionForm` (reused as-is) inside a bottom sheet

### 3. Update: `src/components/agent/AgentMenuDrawer.tsx`
Add a new menu item under the **Tools** category (conditionally rendered when `isFinancialAgent` is true):
```
{ icon: FileText, label: 'Fund Requisition', description: 'Submit financial requests', onClick: onOpenRequisition, accent: 'primary', badge: 'FA' }
```

### 4. Update: `src/components/dashboards/AgentDashboard.tsx`
- Import `useIsFinancialAgent` hook
- Add state for the requisition sheet (`showRequisitionSheet`)
- Pass `onOpenRequisition` callback to `AgentMenuDrawer`
- Render `FinancialAgentSection` sheet when triggered
- Optionally show a small "Financial Agent" badge on the dashboard header when active

| File | Change |
|---|---|
| `src/hooks/useIsFinancialAgent.ts` | New hook — checks `financial_agents` table |
| `src/components/agent/FinancialAgentSection.tsx` | New — sheet wrapping `AgentRequisitionForm` |
| `src/components/agent/AgentMenuDrawer.tsx` | Add conditional menu item |
| `src/components/dashboards/AgentDashboard.tsx` | Wire up hook, state, and sheet |

