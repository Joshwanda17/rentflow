# Fix: Verify/Reject buttons inert in Landlord Ops verification view

## Root cause

`LandlordOpsDashboard.tsx` keeps shared dialog state (reject reason, image preview, assign person, etc.) in the parent component, but the `<LandlordDialogs>` renderer is only mounted inside the **home/overview** view's JSX (and a couple of other branches). The `verify` view (and several sibling sub-views) returns its own JSX tree that does **not** include `<LandlordDialogs>`.

Effect on user:

- **Reject button**: clicking it sets `actionDialog` state, but no `<EmptyHouseActionDialog>` is mounted in the current view, so nothing visibly happens. When the user clicks "Back to Overview", the home view re-mounts — and because the state is still set, the Reject dialog finally pops up there.
- **Verify button**: the optimistic flow tries to surface a toast and then invoke the edge function, but the same view also lacks the dialog/preview surfaces used by sibling interactions (image preview, assign person), so any related side effect appears inert. We will also add a defensive console + toast for the edge-function failure path.

## Fix

1. **Mount `<LandlordDialogs>` in every sub-view that renders listing cards or BackButton**, not just the home view. Concretely add it to the JSX returned by:
   - `view === 'verify'` (the bug the user is reporting)
   - `view === 'pipeline'`, `'chain'`, `'matching'`, `'agents'`, `'cities'`, `'locations'`, etc. — every branch that uses `HouseCardInner`, `setActionDialog`, `setPreviewImages`, or `handleAssignPerson`.
   - Pass the same prop bundle already used at line 1476 / 854.

2. **Refactor to avoid future regressions**: extract the `<LandlordDialogs>` JSX block + its props bundle into a small inline `renderDialogs()` helper inside the component, and call `{renderDialogs()}` once at the bottom of every sub-view return. Single source of truth, impossible to forget.

3. **Tighten the Verify button feedback** so "nothing happens" can never be ambiguous:
   - Already shows a toast on success/failure — confirm Toaster is mounted globally (it is, via `App.tsx`).
   - Add an early `console.log('[Verify] click', listing.id)` at the top of `handleVerifyListing` so we have a breadcrumb if it ever silently fails again.

## Files to edit

- `src/components/executive/LandlordOpsDashboard.tsx`
  - Add `renderDialogs()` helper.
  - Insert `{renderDialogs()}` in each sub-view return (verify, pipeline, chain, matching, agents, cities, locations, and any other branch that currently lacks it).
  - Add the `console.log` breadcrumb in `handleVerifyListing`.

## Out of scope

- No backend / RLS / edge-function changes. The `credit-listing-bonus` edge function is unchanged.
- No visual redesign of the verification card.
