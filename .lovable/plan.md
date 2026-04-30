# Funder Onboarding Referral Attribution

## Goal

When agents / COO / Partner Ops share their `/funder-onboarding` link, every signup that comes through that link must be tagged to the sharer. The Partner Onboarding review page (used by COO and Partner Ops) must then split incoming funders into **Referred** (came via someone's link) and **Direct** (typed the URL themselves).

## Current State

- Agent dashboard already generates short links via `createShortLink(user.id, '/funder-onboarding', { ref: user.id })` — produces `/r/<code>` that resolves to `/funder-onboarding?ref=<uuid>`.
- `/funder-onboarding` (`src/pages/Onboarding.tsx`) calls `signUp(...)` but **discards the `?ref=` param** — so `referrer_id` is never set.
- `profiles.referrer_id` column + `handle_new_user` trigger already read `raw_user_meta_data.referrer_id`. Infra is ready; the page just isn't passing it.
- `/partner-onboarding` (`src/pages/PartnerOnboarding.tsx`) lists all `signup_source = 'funder-onboarding'` profiles in one table with no source split.
- COO Dashboard and Partner Ops Dashboard have **no share-link entry point** for `/funder-onboarding`.

## Plan

### 1. Capture `?ref=` on the onboarding page

Edit `src/pages/Onboarding.tsx`:

- Read `ref` (and optional `role`) from `window.location.search` once on mount, store in component state, and persist to `sessionStorage` (`welile.funder.referrer_id`) so it survives the email-confirmation round-trip.
- Update the local `registerUser` wrapper to accept `referrerId` and call `signUp(...)` with the referrer passed through `raw_user_meta_data` — easiest path is to add an optional `referrerId` param to `signUp` in `src/hooks/auth/authOperations.ts` that sets `data.referrer_id = referrerId` (the existing `handle_new_user` trigger already consumes that key).
- Show a tiny "Referred by an agent" badge on the form when a `ref` is present (purely informational, non-editable).

### 2. Generate short links on COO + Partner Ops dashboards

- **Partner Ops dashboard** (`src/components/executive/PartnersOpsDashboard.tsx`) and **COO dashboard** (`src/pages/COODashboard.tsx` / `src/pages/coo/Dashboard.tsx`): add an "Invite Funder" button (matching the existing Agent dashboard styling) that calls `createShortLink(user.id, '/funder-onboarding', { ref: user.id })` and uses `navigator.share` with clipboard fallback — same pattern as `AgentDashboard.tsx` lines 702–710.
- No new tables needed; `short_links` already attributes the sharer via `user_id`.

### 3. Split Referred vs Direct in Partner Onboarding review

Edit `src/pages/PartnerOnboarding.tsx`:

- Add a tab control above the table: **All / Referred / Direct**.
- Query stays on `signup_source = 'funder-onboarding'`; add `.not('referrer_id', 'is', null)` for Referred and `.is('referrer_id', null)` for Direct.
- Add a "Referred By" column to the table. Resolve referrer name/role via a second lightweight query: `select id, full_name, role` from `profiles` joined to a `user_roles` lookup for the unique referrer_ids on the current page (batch fetch, not per-row).
- Update the KPI cards: keep Total/Pending/Verified/Rejected, and add a fifth small stat "Referred / Direct" showing the split counts.

### 4. (Optional, recommended) Audit trail

On approval/rejection (`approve_self_registered_funder` / `reject_self_registered_funder` RPCs already exist), the funder's `referrer_id` is preserved automatically — no DB change needed. The existing approval flow continues to work; only the listing surfaces the attribution.

## Technical Notes

- **No new tables, no new migrations.** All required columns (`profiles.referrer_id`, `profiles.signup_source`) and infra (`short_links`, `handle_new_user` trigger) already exist.
- `**signUp` signature change** is additive: add optional `referrerId?: string` after `signupSource`. Existing call sites are unaffected.
- **sessionStorage fallback** is needed because email confirmation can drop URL params; the trigger only sees `raw_user_meta_data` set at signup time, so we must read `ref` before submitting the form, not after confirmation.
- **Share-button placement** on COO/Partner Ops should live next to existing "Onboarding" KPI/CTA blocks; reuse the icon + toast pattern from `AgentDashboard.tsx` to stay visually consistent.
- **Tab filtering** uses Supabase's `.is()` / `.not('...', 'is', null)` — no RLS changes needed; managers already have read access to `profiles`.

## Files to Edit

- `src/hooks/auth/authOperations.ts` — add optional `referrerId` to `signUp`.
- `src/pages/Onboarding.tsx` — read `?ref=`, persist to sessionStorage, pass to `signUp`, show "Referred" badge.
- `src/pages/PartnerOnboarding.tsx` — add Referred/Direct tabs, "Referred By" column, batch referrer lookup, updated KPIs.
- `src/components/executive/PartnersOpsDashboard.tsx` — add "Invite Funder" share button.
- `src/pages/COODashboard.tsx` (and/or `src/pages/coo/Dashboard.tsx`) — add "Invite Funder" share button.

## Out of Scope

- Per-share analytics dashboard (clicks, conversion %) — can come later; `short_links` already records views via the existing tracking infra if desired. include this too
- Commission payouts to COO/Partner Ops for referred funders — attribution only.