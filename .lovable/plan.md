## Goal
Turn the current `/welcome` (Landing.tsx) into a swipeable onboarding that briefly explains Welile's four core roles — **Tenant**, **Funder/Supporter**, **Agent**, **Landlord** — before a user picks one and continues to auth.

## Structure

```text
[ Slide 1 ] → [ Slide 2 ] → [ Slide 3 ] → [ Slide 4 ] → [ Role picker + Sign in ]
  Tenant       Supporter      Agent         Landlord
```

Each slide occupies the viewport with:
- Logo (small, top)
- Emoji/icon in gradient tile (reuses current color per role)
- Role name + one-line promise (existing `intent` copy)
- 2–3 short bullets explaining what that role does on Welile
- Progress dots (1/4 … 4/4)
- **Back** / **Next** buttons; **Skip** link top-right jumps to the final picker

Final screen: the existing 4 role cards ("What do you need?") + "Sign in to your account" footer, so anyone who already knows their role can act immediately.

## Copy (brief, plain UGX-safe language)

- **Tenant** — "Move in today, pay daily." Get rent funded instantly · Pay small daily amounts · Build trust as you pay.
- **Funder / Supporter** — "Earn monthly returns backing real tenants." Fund a tenant's rent · Earn monthly returns · Withdraw with 90-day notice.
- **Agent** — "Earn cash by connecting landlords, houses and tenants." List houses & landlords · Post tenant rent requests · Earn commissions & bonuses.
- **Landlord** — "Guaranteed rent, no chasing." List your house free · Get paid upfront by Welile · Tenants managed for you.

## Behaviour

- Route stays `/welcome`; still the public landing.
- Onboarding shown once — persist `welile_onboarding_seen=true` in `localStorage` after reaching the picker or clicking Skip. Returning visitors land directly on the role-picker view (same layout as today) with a small "Replay intro" link.
- Tapping a role on the final picker keeps current behavior: `navigate('/auth?role=<role>')`.
- Keep `PublicHousesPreview`, "Try Rent Calculator" link, trust signals, and the Sign-in footer on the final picker view.
- Remove PWA install banner and iOS install guide from this screen (they clutter onboarding); PWA install remains available elsewhere.
- Animations via existing `framer-motion` (slide horizontal transition). Swipe gestures via `motion` drag on mobile; buttons always available.
- SEO: keep `Helmet` block; update description to reflect onboarding.

## Technical notes

- Single file edit: `src/pages/Landing.tsx`. No new routes, no router changes.
- New local component `RoleSlide` inside the file; reuse `intentOptions` array, extended with a `bullets: string[]` and `title` field.
- State: `step: 0..4` (0–3 = slides, 4 = picker). Initialize to `4` if `localStorage.getItem('welile_onboarding_seen')` is truthy.
- No backend, no schema, no new packages.

## Out of scope

- Auth flow, role permissions, sign-up logic — unchanged.
- Adding Partner/Merchant/staff roles (user confirmed only the four core roles).
