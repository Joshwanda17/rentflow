

# Add "Agent Commission Benefits" Tab to Hamburger Menu

## What Changes

Add a new menu item called **"Agent Commission Benefits"** in the agent dashboard's hamburger menu, placed directly below the "Messages" link. This links to a new informational page that displays the commission structure and rules.

## Implementation

### 1. New Page: `src/pages/AgentCommissionBenefits.tsx`
A static informational page displaying the commission structure in a clean, card-based layout:

- **Repayment Commission (10%)** — split logic explained with clear examples
- **Role Definitions** — Source Agent (2%), Tenant Manager (8%), Recruiter Override (2%)
- **Edge Cases** — same agent gets full 10%, no recruiter means manager keeps 8%
- **Event-Based Bonuses** — table showing the 4 fixed bonuses (UGX 5,000–20,000)
- **Ledger Tracking** — brief note on what's logged (agent_id, tenant_id, event_type, etc.)
- Back navigation header

### 2. Add Route: `src/App.tsx`
Register `/agent-commission-benefits` route pointing to the new page.

### 3. Add Menu Item: `src/components/DashboardHeader.tsx`
Insert a new `DropdownMenuItem` immediately after the "Messages" link (line 218) that navigates to `/agent-commission-benefits`. Icon: a coins/receipt icon from lucide-react (e.g., `Receipt` or `Coins`).

### Files Changed
- **New**: `src/pages/AgentCommissionBenefits.tsx`
- **Edit**: `src/App.tsx` — add route
- **Edit**: `src/components/DashboardHeader.tsx` — add menu item below Messages

