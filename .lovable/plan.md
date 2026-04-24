

## Goal

Replace `/dashboard` with persona-specific URLs. URL becomes the source of truth for which persona is shown, but the existing tab UX inside `Dashboard.tsx` is kept — taps update the URL and the same component renders the right sub-dashboard. `/dashboard` is removed entirely; every caller is updated to a persona slug.

## Final URL map

| Persona | New URL | Notes |
|---|---|---|
| Tenant | `/tenant` | |
| Agent | `/agent` | |
| Landlord | `/landlord` | |
| Funder (internal `supporter` role) | `/funder` | URL uses BOU/CMA term; internal role name unchanged |
| Manager | `/manager` | |

Executive routes (`/ceo/dashboard`, `/cfo/dashboard`, etc.) are untouched — they're already isolated.

## Behaviour

1. **One component, five routes.** `Dashboard.tsx` stays as-is structurally. `App.tsx` mounts the same `<Dashboard />` at `/tenant`, `/agent`, `/landlord`, `/funder`, `/manager`. The component reads the persona from `useLocation().pathname` (via a tiny `slugToRole` helper) and uses that as the source of truth instead of the previous mix of `role`/`displayRole`.
2. **Tabs still feel like tabs.** `BottomRoleSwitcher.handleSwitch` keeps calling the existing `handlePublicRoleSwitch` (so the auth `switchRole`/`grantAndSwitchRole` flow still runs and `useAuth().role` stays in sync), and on success it also `navigate(slug)` so the URL updates. Same animations, same gated-role apply dialog, no flicker — just the URL now matches the active tab.
3. **`/dashboard` is gone.** The route is removed from `App.tsx`. No redirect, no compat layer.
4. **All 47 callers updated.** Every `navigate('/dashboard')` and `navigate('/dashboard?role=X')` is rewritten:
   - Plain `navigate('/dashboard')` → `navigate(roleToSlug(role))` using current `useAuth().role`, falling back to `/tenant` when role is unknown (e.g. fresh post-signup).
   - `navigate('/dashboard?role=supporter')` → `navigate('/funder')` directly.
   - `navigate('/dashboard?role=tenant')` → `navigate('/tenant')`, etc.
   - "Back to dashboard" buttons in sub-pages (`AgentEarnings`, `TransactionHistory`, `OrderHistory`, `FinancialStatement`, `AgentRegistrations`, `ExecutiveHub`, `ManagerAccess`, `DepositHistory`) → use the helper.
5. **Login / signup landing.** `Index.tsx`, `Auth.tsx`, `RegisterTenantPublic.tsx`, `RegisterPartnerPublic.tsx`, `ActivateSupporter.tsx`, `ActivatePartner.tsx` resolve the persona slug from `useAuth().role` (or the `role` param they already pass) and `Navigate` straight to it.
6. **Unknown / no role.** Hitting `/agent` (or any persona) without that role and without "all roles unlocked" → redirect to `/select-role` (current behaviour preserved). No silent role grants from URL.
7. **Auto-default qualified investors.** The existing "if `isQualifiedInvestor` and on auto, switch to supporter" effect is kept, but instead of calling `switchRole('supporter')` it calls `navigate('/funder', { replace: true })` once per session.

## Files

**New**
- `src/lib/roleRoutes.ts` — `roleToSlug(role)`, `slugToRole(pathname)`, `PERSONA_SLUGS = ['tenant','agent','landlord','funder','manager']`. Single source of truth, ~20 lines.

**Edited**
- `src/App.tsx` — remove `/dashboard` route, add five persona routes pointing at `<Dashboard />`.
- `src/pages/Dashboard.tsx` — derive `displayRole` from URL slug instead of `useAuth().role`; keep all frozen / offline / loading / cached-roles logic; auto-default effect navigates instead of switchRole.
- `src/components/BottomRoleSwitcher.tsx` — after successful `onRoleChange(role)`, also `navigate(roleToSlug(role))`. Active-tab detection reads URL.
- `src/pages/Index.tsx`, `src/pages/ActivateSupporter.tsx`, `src/pages/ActivatePartner.tsx`, `src/pages/RegisterTenantPublic.tsx`, `src/pages/RegisterPartnerPublic.tsx` — navigate to persona slug.
- The 47 files containing `navigate('/dashboard'…)` — mechanical rewrite to `navigate(roleToSlug(role))` (or a hard slug where the destination is fixed, e.g. ActivateSupporter → `/funder`).

**Untouched**
- All executive routes, `RoleGuard`, `roleDashboardRoutes`, internal role names, auth flows, sub-dashboard components.

## Risk + mitigation

- **Bookmarks / external links to `/dashboard`** → Add a single `<Route path="/dashboard" element={<Navigate to="/tenant" replace />} />` *only as a last-line catch* OR drop entirely per your direction. Confirm: I'll drop entirely. Old bookmarks 404 to React Router's `NotFound`, which is acceptable since users will re-enter via auth.
- **SMS / email deep links from production** containing `/dashboard?role=X` → these will break. If any are live, we either keep a one-line redirect or update the templates. I'll grep `supabase/functions` for `/dashboard` references during implementation and fix the templates in the same pass; no separate compat route.
- **Mechanical rewrite scale (47 files)** → all are simple substitutions; no logic changes. I'll group them by pattern and batch the edits.

