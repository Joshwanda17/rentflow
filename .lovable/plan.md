

## Inline Partner Registration from Invest-for-Partner Dialog

### Problem
When an agent tries to invest for a partner who isn't in the system, they hit a dead end ("No partners found"). The agent must leave the investment flow, go to a separate registration page, register the partner, then come back — poor UX, especially on mobile.

Additionally, partners without smartphones cannot self-activate. The system must handle this gracefully.

### Solution

**1. Add "Register New Partner" button in the empty state of partner search**

In `AgentInvestForPartnerDialog.tsx`, when `filteredPartners.length === 0` and there's a search query, replace the static "No partners found" message with:
- A prompt: "Partner not found? Register them now"
- A "Register Partner" button that opens the existing `CreateUserInviteDialog` but pre-configured for the "supporter" role

**2. Add "supporter" role to `CreateUserInviteDialog`**

The existing `CreateUserInviteDialog` supports tenant, landlord, and agent roles. Add a `supporter` (Partner/Investor) role option so agents can register supporters directly. Also add an optional `defaultRole` and `lockRole` prop so the invest dialog can open it pre-set to supporter with no role switching.

**3. Auto-refresh partner list after registration**

After the `CreateUserInviteDialog` succeeds (via `onSuccess` callback), re-fetch the partners list in the invest dialog so the newly registered partner appears immediately and the agent can continue the investment without leaving the flow.

**4. Handle partners without smartphones**

For partners without smartphones who cannot click activation links:
- After investment, the share message already contains the activation link and temporary password
- Add a clear note on the success screen: "If your partner doesn't have a smartphone, you can activate their account on their behalf using the activation link on any device"
- The agent can open the `/join?t=...` link themselves on their own phone, enter the temp password, and complete activation while the partner is present — this is already supported by the existing activation flow

### Files to Modify

1. **`src/components/agent/AgentInvestForPartnerDialog.tsx`**
   - Import `CreateUserInviteDialog`
   - Add state for `showRegister` dialog
   - In the empty partners list state, show a "Register Partner" button
   - On registration success, re-fetch partners list
   - Add a helper note on the success screen about non-smartphone partners

2. **`src/components/agent/CreateUserInviteDialog.tsx`**
   - Add `supporter` to the `UserRole` type and `roleConfig`
   - Add optional `defaultRole` and `lockRole` props
   - When `lockRole` is true, skip role selection step

### Flow After Changes

```text
Agent opens "Invest for Partner"
  → Searches for partner
  → Partner not found
  → Taps "Register Partner"
  → CreateUserInviteDialog opens (locked to supporter role)
  → Agent enters name, phone, temp password
  → Registration succeeds → dialog closes
  → Partner list auto-refreshes with new partner
  → Agent selects them, enters amount, payout day
  → Confirms investment
  → Success screen with share buttons + note for non-smartphone users
```

