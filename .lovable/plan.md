## Goal
Make the onboarding flow at `/welcome` (Landing.tsx) send users to `/auth` when they tap **Skip** or the **Next** button on the final slide, instead of landing on the role-picker view.

## Changes (single file: `src/pages/Landing.tsx`)

1. **Skip button** (top-right of slides):
   - Currently sets `step = 4` (role picker) and marks `welile_onboarding_seen`.
   - Change: still persist `welile_onboarding_seen=true`, then `navigate('/auth')`.

2. **Next button on the final slide (Landlord, step 3)**:
   - Currently advances `step` to `4` (picker).
   - Change: relabel to "Get started" (or keep "Next"), persist `welile_onboarding_seen=true`, then `navigate('/auth')`.
   - Intermediate slides (steps 0–2) keep advancing to the next slide as today.

3. **Returning-visitor behaviour**:
   - Since the picker view is no longer the destination, initialize returning users (`welile_onboarding_seen` truthy) directly to `/auth` via a `useEffect` redirect — OR keep the picker as the "already onboarded" landing and only bypass it from Skip/final-Next. Recommendation: **redirect returning visitors straight to `/auth`** so `/welcome` is purely first-run onboarding. "Replay intro" link is removed since there's no picker view to host it.

4. **Role picker view (step 4)**:
   - No longer reachable from onboarding. Two options:
     - **(a) Remove it entirely** — simpler, `/welcome` is 4 slides only.
     - **(b) Keep it as dead code** — not recommended.
   - Recommendation: **(a) remove** the picker branch, `PublicHousesPreview`, trust signals, and Sign-in footer from this page. Auth page already handles role selection via `?role=` query param if needed later.

## Open question
Do you want the **Next** on each slide to also pass the current role as `/auth?role=<role>` (so the auth screen pre-selects it), or just a plain `/auth`?

## Out of scope
- Auth page itself, routing config, role logic.
