

# Add "Share Landlord Signup" to Agent Menu Drawer

## What's Missing

The landlord signup page (`/landlord-signup`) exists but there's **no share button** in the Agent Menu Drawer. The drawer already has share actions for Tenant Form, Partner Form, Funder, and Angel Investor — but not for landlords.

## Plan

### 1. Add `onShareLandlordSignup` prop to `AgentMenuDrawer.tsx`
- Add a new menu item in the "Share & Grow" section alongside the existing share links
- Icon: `Building2`, Label: "Share Landlord Signup", Description: "Invite landlords to guarantee rent"
- Badge: `🏠`

### 2. Wire up the handler in `AgentDashboard.tsx`
- Add an `onShareLandlordSignup` async handler that:
  - Generates a short link to `/landlord-signup?ref={agent.id}` using `createShortLink`
  - Uses `navigator.share()` on mobile (WhatsApp-optimized) with a compelling message like: *"Guarantee your rent for 12 months with Welile! Sign up here: {link}"*
  - Falls back to clipboard copy on desktop
- Pass this handler to the `AgentMenuDrawer`

### Technical Details
- **Files to edit**: `src/components/agent/AgentMenuDrawer.tsx`, `src/components/dashboards/AgentDashboard.tsx`
- Follows the exact same pattern as `onShareTenantForm` and `onSharePartnerForm`
- The `?ref=` param is already supported by the landlord signup page for agent attribution

