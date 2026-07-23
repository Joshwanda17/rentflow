## Phase Two — Recruitment Campaign Attribution & Persistence

Extends Phase One. No tenant scope. No new reward rule (existing UGX 10,000 on 3 verified houses stays).

### 1. New backend tables (migration, additive only)

- `campaign_attributions` — server-side source of truth.
  - `attribution_token` (secure random, unique), `campaign_link_id`, `campaign_id`, `referring_agent_id`, `campaign_location_id`, `selected_source`, `link_type`, `placement_name`, `anonymous_visitor_id`, `initial_click_id`, `latest_click_id`, `status` (`active | registration_started | registration_completed | expired | invalidated | duplicate | existing_user`), `first_seen_at`, `last_seen_at`, `expires_at`, `registration_started_at`, `registration_completed_at`, `registered_user_id`, `registered_sub_agent_id`, `locked_at`.
  - Indexes on token, link, agent, visitor, registered_user, status, expires_at.
  - Unique partial index preventing duplicate `registration_completed` per `registered_user_id`.
- `sub_agent_registration_drafts` — multi-step draft, non-sensitive fields only, no passwords.
- `campaign_attribution_audit_logs` — append-only history of attribution changes.
- `recruitment_campaigns.attribution_window_days` (default 30) added if missing.

RLS: all tables locked to service_role + owning agent read where applicable. GRANTs included per house rules.

### 2. New/updated edge functions

- `campaign-resolve` (public, no JWT): validates short code, records click (dedup by visitor + short window), creates or refreshes a `campaign_attributions` row, filters obvious bots by UA, returns `{ attribution_token, canonical_slug, campaign_meta }`. Sets first-party cookie `welile_campaign_attribution` (HttpOnly, Secure, SameSite=Lax, 30d).
- `campaign-attribution-restore`: given a token from cookie or localStorage, validates server-side and rehydrates cookie; returns campaign meta or `invalid|expired|completed`.
- `campaign-registration-draft` (upsert): persists step progress keyed by attribution token; idempotent.
- `campaign-registration-complete`: transactional — creates user/sub-agent (reusing existing sub-agent registration RPC), links to attribution, locks attribution, marks `registration_completed`, writes audit row. Idempotency key required.
- Existing `campaign-click` kept but delegates to `campaign-resolve` for de-dup consistency.

### 3. Attribution lifecycle rules

- Latest valid link wins UNTIL lock point (successful phone/OTP verification or first server-confirmed identity step). After lock, new clicks are recorded as interactions but never replace `referring_agent_id`.
- Existing-user phone: attribution marked `existing_user`, no sub-agent created, no reward, friendly redirect to login.
- Canonical slug: if URL slug mismatches stored slug, redirect to canonical while keeping same attribution.

### 4. Frontend changes

- `src/lib/campaignAttribution.ts` — replace localStorage-first flow with:
  1. Read cookie via a lightweight `/functions/v1/campaign-resolve/whoami` check.
  2. Fallback to `localStorage` token; validate through `campaign-attribution-restore`.
  3. Never trust local values without server validation.
  4. Expose `useCampaignAttribution()` hook.
- `src/pages/CampaignRedirect.tsx` — call `campaign-resolve` (single call replacing click+resolve pair), honor canonical redirect, then navigate to `/auth?ref=campaign` (unchanged URL surface).
- `src/hooks/useAuth.tsx` — after successful auth/OTP, call `campaign-registration-complete` with idempotency key; on success, clear draft, keep historical attribution.
- Registration flow (OTP screens): call `campaign-registration-draft` at each meaningful step; on reload, hydrate step from draft.
- Recovery banner: subtle "Continue your Welile sub-agent registration" strip shown when active attribution + no completed registration.
- Agent Campaign dashboard (`AgentCampaignsPage.tsx`):
  - Always list from DB (already true) — verify no state-only links; ensure QR modal reuses stored `short_code` (no regeneration).
  - Add columns: returning visitors, registration starts, completed registrations, qualified sub-agents.
- Admin dashboard: same additional metrics + attribution funnel.

### 5. Analytics view

New view/RPC `campaign_link_metrics_v2` returning: total_clicks, unique_visitors, returning_visitors, registration_starts, completed_registrations, qualified_sub_agents. Reused by agent + admin pages.

### 6. Security

- Attribution tokens: 32-byte base64url, generated via `pgcrypto`.
- Cookie HttpOnly + Secure + SameSite=Lax, set only from edge functions.
- Rate-limit `campaign-resolve` per IP+short_code.
- RLS: agents can read only their own links + metrics; admins full.

### 7. Data migration (safe, additive)

- Backfill `campaign_attributions` from existing `recruitment_campaign_registrations` where visitor + link are known; leave the rest untouched.
- No deletes, no resets of Phase One data.

### 8. Tests

Vitest + Playwright covering:
- Link persistence after refresh/logout/login.
- QR modal reuses same short code.
- Attribution restore from cookie and localStorage.
- OTP → completion keeps original agent.
- Existing phone → no duplicate sub-agent, no reward.
- Idempotent double-submit of completion.
- Slug mismatch canonical redirect keeps attribution.
- Disabled link blocks new attribution but preserves history.

### 9. Explicit non-goals

- No tenant campaign work.
- No changes to reward formula.
- No GPS prompts.
- No rebuild of Phase One tables.

### Rollout order

1. Migration for new tables + column + indexes + RLS + GRANTs.
2. Edge functions (resolve, restore, draft, complete).
3. Frontend attribution lib + CampaignRedirect + registration hooks.
4. Dashboard metric upgrades.
5. Backfill migration.
6. Tests.

Ready to execute on approval.
