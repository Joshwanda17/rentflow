
# Plan: Add "Invest for Partner" Menu Item to Agent Dashboard

## What
Add a new menu item called **"Invest for Partner"** as the first item in the "Agent Actions" section of `AgentMenuDrawer`, above "My Tenants". When tapped, it opens a new dialog where the agent selects a partner (supporter) and submits an investment into the rent pool on their behalf.

## Changes

### 1. Create `AgentInvestForPartnerDialog.tsx`
New dialog component at `src/components/agent/AgentInvestForPartnerDialog.tsx`:
- Fetches list of supporters (profiles with `supporter` role from `user_roles` table) to populate a searchable select dropdown
- Shows selected partner's wallet balance
- Agent enters investment amount and payout day (1-28), mirroring the existing `FundRentDialog` logic
- Calls the existing `fund-rent-pool` edge function with the partner's user ID context (or a new edge function `agent-invest-for-partner` if the existing one is user-scoped)
- Shows success confirmation with monthly reward estimate
- Validation: amount > 0, amount <= partner wallet balance, amount <= total_rent_requested, payout day 1-28

### 2. Update `AgentMenuDrawer.tsx`
- Add new prop `onInvestForPartner: () => void`
- Insert new menu item at position 0 in "Agent Actions" section:
  - Icon: `HandCoins` (from lucide-react)
  - Label: "Invest for Partner"
  - Description: "Fund rent pool on behalf of a partner"
  - Color: `text-emerald-600`
  - Badge: "Proxy"

### 3. Update `AgentDashboard.tsx`
- Add state: `investForPartnerOpen`
- Wire `onInvestForPartner` prop to open the dialog
- Render `AgentInvestForPartnerDialog`

### 4. Edge Function Consideration
- The existing `fund-rent-pool` function likely uses `auth.uid()` to identify the investor. A new edge function `agent-invest-for-partner` may be needed that accepts a `partner_id` parameter and validates the calling user is an agent. This will be determined during implementation by inspecting the existing edge function code.
