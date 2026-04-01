

# Agent Agreement Page, Profile Integration & Angel Investor Sharing

## What We're Building

1. **Agent Agreement as a standalone page** (`/agent-agreement`) — readable, downloadable, printable, with a one-click "I Agree" accept button (mirrors the existing `/landlord-agreement` pattern)
2. **Quick-access button on user profiles** — show the agreement link on agent profiles and angel investor profiles
3. **Default light theme** — already done (`defaultTheme="light"` in App.tsx)
4. **Agent can share an Angel Investor onboarding link** — add an "Invite Angel Investor" action in the Agent Menu that shares a referral link with `role=supporter` (angel investors use the supporter/funder role)

## Steps

### 1. Create `/agent-agreement` page
**New file**: `src/pages/AgentAgreement.tsx`

- Follow the exact pattern of `LandlordAgreement.tsx`
- Sticky header with back button, title, version badge, download + print buttons
- Full agreement text from `AgentAgreementContent.ts` with auto-filled name/phone/date
- Add a footer with the "I Agree" accept button (using `useAgentAgreement` hook) — if already accepted, show a green "Accepted" badge instead
- One-click acceptance: checkbox is not needed here since the page itself is the reading experience

### 2. Register the route in App.tsx
- Lazy import `AgentAgreement` page
- Add `<Route path="/agent-agreement" element={<AgentAgreement />} />`

### 3. Add agreement button to Agent Menu
**Edit**: `src/components/agent/AgentMenuDrawer.tsx`

- Add a menu item in the "Tools" section: `{ icon: ScrollText, label: 'Agent Agreement', description: 'View & accept terms', path: '/agent-agreement' }`

### 4. Add agreement link to user profiles
**Edit**: `src/components/profile/UserStatsSection.tsx` (or the relevant profile component)

- For agent-role users: show an "Agent Terms & Conditions" link card pointing to `/agent-agreement`
- For angel investor / supporter profiles: show the same link if they have an associated agent agreement

### 5. Add "Invite Angel Investor" sharing action
**Edit**: `src/components/dashboards/AgentDashboard.tsx`

- Add a new handler similar to `onInviteFunder` but with messaging tailored to angel investors
- Share link: `${getPublicOrigin()}/auth?ref=${user.id}&role=supporter` with share text about joining the Angel Pool
- Wire it to a new menu item in `AgentMenuDrawer.tsx` under Actions: `{ icon: Briefcase, label: 'Invite Angel Investor', description: 'Share Angel Pool signup link', onClick: onInviteAngelInvestor }`

### 6. Theme confirmation
Already set — `defaultTheme="light"` in `App.tsx` line 376. No changes needed.

## Files Changed

| File | Action |
|------|--------|
| `src/pages/AgentAgreement.tsx` | Create (standalone agreement page with accept) |
| `src/App.tsx` | Edit (add route + lazy import) |
| `src/components/agent/AgentMenuDrawer.tsx` | Edit (add Agreement + Invite Angel Investor menu items) |
| `src/components/dashboards/AgentDashboard.tsx` | Edit (add onInviteAngelInvestor handler) |
| `src/components/profile/UserStatsSection.tsx` | Edit (add agreement link for agents/investors) |

