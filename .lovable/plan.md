

# Angel Pool Agreement Page + Profile Integration + Investor Sharing

## Overview

Create a standalone Angel Pool Shareholders Agreement page based on the uploaded PDF, add quick-access buttons on user/investor profiles, and ensure agents can share angel investor onboarding links. The app already defaults to light theme.

## What Already Exists
- `/agent-agreement` page — agent terms (already done)
- Agent menu already has "Invite Investor" with 🦄 badge sharing `/auth?ref=...&role=supporter`
- `UserStatsSection` already shows "Agent Terms & Conditions" link
- Supporter menu has an "Agreement" item pointing to the supporter agreement modal
- Light theme is already the default

## What's New

### 1. Create Angel Pool Agreement Content
**New file**: `src/components/angel-pool/agreement/AngelPoolAgreementContent.ts`

Full agreement text from the uploaded PDF (10 sections: Purpose, Pool Structure, Supersession, Participation, Rights, Dividends, Future Structure, Governance, Risk Disclosure, Signatures). Version: `v1.0`.

### 2. Create Angel Pool Agreement Page
**New file**: `src/pages/AngelPoolAgreement.tsx` (route: `/angel-pool-agreement`)

Same pattern as `AgentAgreement.tsx`:
- Sticky header: back button, title "Angel Pool Agreement", version badge, download + print buttons
- Agreement body in a card with `<pre>` formatting, auto-filled participant name and date
- Sticky footer: one-click "I Agree" button using a new `useAngelPoolAgreement` hook — or shows green "Accepted" badge if already accepted

### 3. Create `useAngelPoolAgreement` hook
**New file**: `src/hooks/useAngelPoolAgreement.ts`

Same pattern as `useAgentAgreement` — checks/inserts into `agent_agreement_acceptance` table (reusing the same table with a different `agreement_version` like `angel-pool-v1.0`).

### 4. Register the route
**Edit**: `src/App.tsx`
- Add lazy import for `AngelPoolAgreement`
- Add `<Route path="/angel-pool-agreement" element={<AngelPoolAgreement />} />`

### 5. Add agreement link to profiles
**Edit**: `src/components/profile/UserStatsSection.tsx`
- Add a second button below the existing "Agent Terms" button: "Angel Pool Agreement — Tap to view & sign" for any user who has agent or referral stats (they may also be investors)

### 6. Add agreement link to Supporter Menu
**Edit**: `src/components/supporter/SupporterMenuDrawer.tsx`
- Add "Angel Pool Agreement" item in the Account section alongside the existing supporter agreement

### 7. Add agreement link to Angel Pool page
**Edit**: `src/pages/AngelPool.tsx`
- Add a quick-access button to `/angel-pool-agreement` below the portfolio hero, styled like the "Terms Accepted" badge but navigating to the full agreement page

## Files Changed

| File | Action |
|------|--------|
| `src/components/angel-pool/agreement/AngelPoolAgreementContent.ts` | Create |
| `src/hooks/useAngelPoolAgreement.ts` | Create |
| `src/pages/AngelPoolAgreement.tsx` | Create |
| `src/App.tsx` | Edit (add route) |
| `src/components/profile/UserStatsSection.tsx` | Edit (add angel pool agreement button) |
| `src/components/supporter/SupporterMenuDrawer.tsx` | Edit (add menu item) |
| `src/pages/AngelPool.tsx` | Edit (link "Terms Accepted" badge to agreement page) |

## Technical Notes
- Reuses `agent_agreement_acceptance` table with `agreement_version = 'angel-pool-v1.0'` to avoid new migrations
- No new DB tables needed
- Agent sharing of angel investor link already works via the existing "Invite Investor" 🦄 action in AgentMenuDrawer
- Light theme already configured — no changes needed

