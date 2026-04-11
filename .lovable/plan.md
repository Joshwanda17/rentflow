
Goal: make public role switching feel stable on mobile and stop the “shows for a moment, then disappears” behavior.

What I found
- The main bug is a race condition between adding a public role and switching to it:
  - `src/pages/Dashboard.tsx` calls `await addRole(newRole)` and then immediately calls `switchRole(newRole)`.
  - `src/hooks/useAuth.tsx` only switches if `roles.includes(newRole)`.
  - Because React state updates are async, `roles` is still stale in that same moment, so the switch is rejected and the UI snaps back.
- The current transition is timer-based (`300ms`) instead of state-based, so it can hide/show the wrong dashboard while auth state is catching up.
- `src/components/dashboards/SupporterDashboard.tsx` hardcodes `availableRoles={['supporter']}`, so the top role picker becomes inconsistent even after a successful switch.
- Role visibility logic is duplicated across multiple components, which makes these bugs easier to reintroduce.

Best way to fix it
1. Fix the role-switch race at the auth layer
- Update the auth provider so switching uses the latest role state, not stale closure state.
- Best implementation:
  - keep a `rolesRef` synced with `roles`, and let `switchRole` validate against `rolesRef.current`
  - or add a dedicated `grantAndSwitchRole(newRole)` flow that updates roles and active role atomically
- This is the real fix; UI-only delays won’t solve it reliably.

2. Replace timer-based transition logic with a pending target role
- In `Dashboard.tsx`, track `pendingRole`.
- When a user taps a public role:
  - set `pendingRole = newRole`
  - if needed, grant the role
  - switch role
  - keep showing a loading state until the active role actually becomes `newRole`
- Clear `pendingRole` only when:
  - `role === pendingRole`, or
  - the grant/switch fails
- This removes flicker caused by arbitrary timeouts.

3. Keep role controls visually stable during transition
- While switching, keep the bottom role switcher visible.
- Highlight the tapped role immediately using `pendingRole ?? currentRole`.
- Temporarily disable repeated taps until the switch completes.

4. Fix inconsistent header role availability
- In `SupporterDashboard.tsx`, pass the real `availableRoles` instead of hardcoding `['supporter']`.
- Check other dashboards for any similar hardcoded role lists and align them.

5. Centralize public-vs-restricted role rules
- Create one shared source of truth for:
  - public roles: `tenant`, `agent`, `supporter`, `landlord`
  - restricted/staff roles
  - visibility rules
  - switch/grant rules
- Reuse it in:
  - `BottomRoleSwitcher.tsx`
  - `Dashboard.tsx`
  - `DashboardHeader.tsx`
  - `RoleSwitcher.tsx`
- This will stop different switchers from behaving differently.

Technical details
- Files to update:
  - `src/hooks/useAuth.tsx`
  - `src/pages/Dashboard.tsx`
  - `src/components/dashboards/SupporterDashboard.tsx`
  - optionally extract shared role config into a small helper/constants file
- Recommended logic flow:
```text
tap role
  -> set pendingRole
  -> if public role missing, add it
  -> switch active role using latest roles state
  -> render loading until active role matches pendingRole
  -> clear pendingRole
```
- Important guardrails:
  - Do not rely on `setTimeout` to decide when switching is “done”
  - Do not hardcode role lists separately in multiple UI components
  - Keep staff/admin roles gated by backend-backed assigned roles only

Expected result
- Public roles stay available at all times.
- Tapping a public role smoothly loads that dashboard without flashing and snapping back.
- The top and bottom role switchers stay consistent.
- Staff/admin roles remain restricted to users who already have them.

If you approve, I’ll implement this as a proper state-driven fix rather than another temporary timing workaround.
