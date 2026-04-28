# Fix Agent Dashboard — Bottom Nav "Moving" Illusion

## What's actually happening

The `BottomRoleSwitcher` (Tenant / Agent / Funder / Owner) is **already fixed** at `bottom-0` and never moves. The bar that appears to "move up on scroll" in screenshot 2 is a **different** component: `AgentHubTabs` (Home / Money / Tenants / Grow / Sub Agents), which is rendered inline inside the scrollable `<main>` content. As the user scrolls down, that tab row scrolls upward and ends up sitting directly on top of the fixed role switcher, creating the illusion of a single bar that "moved".

A second, related bug: `<main>` currently has `pb-2` (8px), but the fixed role switcher is ~60px tall. The last items in the dashboard (the "Field Coll…" pill, "Refresh totals", etc.) get **hidden behind** the role switcher when scrolled to the bottom — clearly visible in screenshot 2.

## Fix

**File: `src/components/dashboards/AgentDashboard.tsx`**

1. **Restore safe bottom padding on `<main>`** so scrolled content clears the fixed `BottomRoleSwitcher`:
   - Change `pb-2` → `pb-24` (96px) on the `<main>` element at line 325.
   - This guarantees the last card / button is fully visible above the fixed nav at the end of scroll.

2. **Make `AgentHubTabs` sticky to the top of the scroll area** (recommended), so it stays in view as a section nav and never collides with the bottom role switcher:
   - Wrap the `AgentHubTabs` instance inside a `sticky top-0 z-20 bg-background` container.
   - This keeps the Home/Money/Tenants/Grow/Sub Agents tabs anchored under the header rather than floating into the bottom nav.

   *(Alternative if sticky tabs are undesirable: keep them inline but add a clear visual divider + extra `mb-4` so they read as part of the content, not as a bottom nav.)*

3. **No change needed to `BottomRoleSwitcher.tsx`** — it is already correctly `fixed bottom-0` with safe-area inset padding. Confirmed working as designed.

## Verification checklist (post-implementation)

- [ ] At the top of `/dashboard/agent` the role switcher sits at the bottom of the viewport.
- [ ] Scrolling down: the role switcher stays glued to the bottom and does NOT move.
- [ ] The `AgentHubTabs` row no longer collides with the role switcher at scroll end.
- [ ] The last content row ("Refresh totals" / "Field Collect" pill) is fully visible — not clipped behind the bottom nav — when scrolled to the bottom.
- [ ] No new horizontal scrollbars or layout shifts on 390×844 viewport.

## Technical notes

- Root container is `h-[100dvh] flex flex-col overflow-hidden` with a `flex-1 overflow-y-auto` scroll region — so `pb-*` on `<main>` is the correct lever for bottom clearance (not margin on the parent).
- `pb-24` accounts for: ~56px nav height + ~env(safe-area-inset-bottom) + ~8px breathing room.
- Sticky tabs work because the immediate scroll ancestor is `<div class="flex-1 overflow-y-auto">`, which is a valid containing block for `position: sticky`.
