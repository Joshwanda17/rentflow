# Surface "Verify & Earn" as an inline CTA on mobile

## Problem

`VerificationOpportunitiesButton` (the "Verify & Earn 17" pill) renders as a fixed FAB at `bottom-24 right-4` on mobile. On the same right edge there is already `FieldCollectFab` anchored at `bottom: var(--fab-bottom)` (~84–100 px on mobile) plus `CreditVerificationButton` at `bottom-36`. The three FABs **stack and overlap** on small screens, so "Verify & Earn" ends up tucked **behind / under** the Field Collect FAB. That's what the user is calling out — a primary earnings affordance should never be hidden behind another button.

## Fix

Move the Verify & Earn trigger out of the FAB stack and render it as a **prominent inline CTA at the top of the agent dashboard** on mobile. The bottom sheet (Houses / Tenants tabs, GPS-gated verification flows) stays exactly as it is.

### 1. `src/components/agent/VerificationOpportunitiesButton.tsx`

- Replace the `fixed bottom-24 …` `<button>` (lines 144–153) with an **inline** trigger:
  - Full-width pill/card: gradient/`bg-primary` background, Shield icon on left, "Verify & Earn" label, right-aligned count badge, subtle "UGX 5–10K bonuses" subline.
  - Tailwind: `w-full rounded-2xl px-4 py-3 flex items-center gap-3 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-md active:scale-[0.99] touch-manipulation`.
  - Same `onClick={handleOpen}` and same `if (totalCount === 0) return null;` early return.
- Keep the existing `<Sheet>` block untouched.
- No `fixed` / `bottom-*` / `z-*` classes on the trigger anymore.

### 2. `src/components/dashboards/AgentDashboard.tsx`

- **Remove** `<VerificationOpportunitiesButton />` at line 1009 (it was sitting in the FAB layer).
- **Mount it inline** as the first child of `<main className="agent-dashboard-main …">` (around line 433, just before the hero / wallet card), so it appears at the top of the scrollable content on every dashboard tab.
- Wrap nothing else around it — the component returns `null` when `totalCount === 0`, so when there's nothing to verify the dashboard layout is unchanged.

### 3. Leave the other FABs alone

- `CreditVerificationButton` (bottom-36) and `FieldCollectFab` (`var(--fab-bottom)`) stay as-is — the user only flagged "Verify & Earn". Removing one FAB from the stack also gives `CreditVerificationButton` clearer room on small screens as a side benefit.

### 4. Verify

- Mobile preview (390×844): open `/dashboard/agent` with `totalCount > 0` → inline Verify & Earn banner is the first thing visible at the top of the dashboard content; tapping it opens the same bottom sheet; no FAB on the bottom-right for this button.
- Mobile preview with `totalCount === 0`: dashboard renders normally, no empty banner.
- Desktop (≥1024): same inline banner appears at the top of the agent dashboard column — consistent across breakpoints, no overlap with the right-edge FABs (`FieldCollectFab`, `CreditVerificationButton`).
- The sheet's Houses / Tenants tabs, GPS-gated verify flows, and bonus payouts behave exactly as before — no logic change inside the sheet.

## Out of scope

- No backend or RPC changes.
- No changes to `FieldCollectFab` or `CreditVerificationButton`.
- No changes to the Android backdrop-blur / compositor tearing detector (separate issue).
