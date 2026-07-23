# Field Recruitment Campaign Tracking — Phase One

Build a campaign + short-link tracking system that plugs into the existing sub-agent referral + UGX 10,000 (three verified houses) reward. No new reward logic, no GPS.

## What ships

### 1. Database (single migration)

New tables in `public`:

- `recruitment_campaigns` — id, name, description, objective, start_date, end_date (nullable), status (`draft|active|paused|completed`), created_by, timestamps.
- `recruitment_campaign_agents` — campaign_id, agent_id, status, joined_at (unique campaign+agent).
- `recruitment_locations` — id, country, region, district (required), city, division, slug (unique), display_name. Seeded with a small starter set (Kampala, Mbale, Jinja, Mbarara, Gulu, Lira, Masaka, Fort Portal, Arua, Soroti, Hoima); admins can add more.
- `recruitment_campaign_links` — id, short_code (unique, 6–8 chars, secure random), campaign_id, agent_id, location_id, location_slug (denormalized), selected_source (enum), link_type (enum), placement_name, status (`active|disabled|expired`), first_click_at (for lock rule), expires_at, timestamps, plus cached counters: total_clicks, unique_clicks, total_registrations, total_sub_agent_registrations, qualified_sub_agents.
- `recruitment_campaign_clicks` — link_id, campaign_id, agent_id, visitor_id (first-party cookie/uuid), timestamp, referrer, browser, os, device_category, ip_hash, approximate_location (jsonb), converted_to_registration.
- `recruitment_campaign_registrations` — link_id, campaign_id, agent_id, registered_user_id (unique), location_id, selected_source, registered_at, qualification_status (`registered|active|one_verified_house|two_verified_houses|reward_qualified|reward_paid`), verified_houses_count, first/second/third_verified_at, reward_qualified_at.
- `recruitment_campaign_link_audit_logs` — link_id, action, old_value, new_value, changed_by, changed_at, reason.

Enums: `recruitment_source` (whatsapp, facebook, tiktok, sms, qr_sticker, printed_poster, direct_link, agent_assisted, other), `recruitment_link_type` (general_campaign_link, qr_sticker, printed_poster, assisted_registration, social_share).

Indexes: `short_code` unique, `(campaign_id)`, `(agent_id)`, `(location_id)`, `(created_at)`, `clicks(link_id, timestamp)`, `registrations(agent_id)`, `(campaign_id, agent_id)` on links.

GRANTs + RLS:

- Agents: read their own links / clicks / registrations; join campaigns; insert their own links (RPC); disable their own links.
- Admins (manager, cto, coo): full read; write on campaigns and locations; disable any link.
- Public (anon): only via edge function — no direct table access to short_code → attribution.

Triggers / RPCs:

- `generate_campaign_short_code()` — cryptographically random, collision-retry.
- `create_campaign_link(campaign_id, location_id, source, link_type, placement)` — validates agent participation + active campaign, inserts row, returns short_code.
- `disable_campaign_link(link_id)` — agent-owner or admin, writes audit row.
- `edit_campaign_link(...)` — allowed only while `first_click_at IS NULL` (agent) or admin at any time; writes audit row.
- `on_house_verified` trigger on `house_listings` (or existing verification path): when a listed house belonging to a sub-agent transitions to verified, if that sub-agent has a `recruitment_campaign_registrations` row, increment `verified_houses_count`, stamp dates, roll qualification_status forward, and on reaching 3 call the existing UGX 10,000 credit path exactly once (idempotent guard via `reward_qualified_at IS NULL`). Reuses existing `credit_recruiter_override`/listing verification bonus channel — no new reward.
- `refresh_link_counters(link_id)` — small counter update called from click + registration paths (single row UPDATE, no aggregation scan).

### 2. Edge function `campaign-redirect`

Public (no JWT). `GET /c/:slug/:shortCode`:

1. Look up short_code (single indexed query, joins campaign + location + agent in one round trip).
2. If not found or link/campaign not active → render friendly disabled/expired HTML page.
3. If slug mismatches canonical → 302 to canonical `/c/{location_slug}/{shortCode}`.
4. Read/set `wr_visitor` first-party cookie (uuid, httpOnly=false, 90 days). Set signed `wr_ref` cookie carrying `{link_id, campaign_id, agent_id, source}` for registration attribution.
5. Insert a `recruitment_campaign_clicks` row + one UPDATE incrementing `total_clicks` and (if new visitor for link) `unique_clicks`. Both writes in one transaction via RPC `record_campaign_click`.
6. 302 to `/register?ref=campaign` (registration page reads the signed cookie).

Uses UA parsing inline; hashes IP with per-project pepper. No GPS. No fingerprinting.

### 3. Registration attribution

- New route `/c/:slug/:shortCode` in the SPA calls the edge function via `<meta http-equiv="refresh">`? No — actually the client hits the edge function directly (link points at the function URL rewritten by a small Vite route that immediately calls the function). Cleanest: edge function is the public URL — links are `https://welilereceipts.com/c/{slug}/{code}` served by a supabase edge function mounted at that path via existing hosting. In practice we route `/c/*` inside the SPA to a tiny `CampaignRedirect` page that calls the `campaign-redirect` function and follows its redirect; the function issues the cookie + records the click.
- On the existing Sub-Agent registration screen: read the `wr_ref` cookie, verify signature via `resolve-campaign-ref` edge function, prefill hidden `referrer_agent_id` + link_id. Show a small banner: “Join Welile as a Sub-Agent — {Campaign name} — {District}”. No sensitive IDs shown.
- On successful registration, call `attach_campaign_registration(user_id)` RPC which:
  - Validates campaign + link still active.
  - Ensures user is a new sub-agent (checks `user_roles` + not already attributed).
  - Sets `profiles.referrer_id` if empty (respects existing referral rules).
  - Inserts `recruitment_campaign_registrations` and bumps link counters.
  - Marks the click row `converted_to_registration=true` for that visitor.

### 4. Agent dashboard — `Campaign Tracking`

New route `/agent/campaigns`. Uses one composite RPC `get_agent_campaign_dashboard(agent_id)` returning `{ campaigns[], links[], totals }` in a single round trip.

- Active campaigns as cards (name, status, my links, clicks, unique, registrations, sub-agents, qualified, rewards qualified).
- “Generate link” dialog: campaign, district (required), city, area, selected source, link type, placement name → submits `create_campaign_link` RPC → shows short link, QR (client-side `qrcode` lib), Copy/Share/Download QR/View analytics.
- Links table (paginated, mobile-friendly card view <768px): short link, campaign, location, source, type, placement, clicks, unique, registrations, sub-agents, qualified, status, created, actions (Copy, Share, QR, Download QR, Analytics, Disable).
- Per-link analytics drawer: funnel + click timeline + registration list (attributed tenants/sub-agents) via `get_link_analytics(link_id)`.

### 5. Admin dashboard add a page in the CMO dashboard

New route `/admin/recruitment-campaigns`  in CMO dashboard(visible to manager/cto/coo).

- Campaign CRUD (draft → active → paused → completed).
- Locations manager (add district/slug).
- Summary cards + filters (campaign, agent, district, source, link type, status, date range).
- Tables: Performance by Location, Performance by Source, Performance by Agent — all fed by 3 dedicated aggregate RPCs so the UI never does N+1.
- Campaign funnel: link generated → clicked → registered → sub-agent → 1st/2nd/3rd verified house → reward qualified → reward paid, via `get_campaign_funnel(campaign_id)`.
- Participating agents view; audit log viewer for link edits.

### 6. Reward hook

- Piggyback on existing house-verification trigger (`on_house_verified` or equivalent listing-verification path already crediting recruiter override). Extend it to also update `recruitment_campaign_registrations` and, on the 3rd verified house, flip `qualification_status='reward_qualified'` and record `reward_qualified_at`. The actual UGX 10,000 credit stays in the existing reward system, invoked exactly once per referred sub-agent (idempotent by `reward_qualified_at IS NULL AND reward_paid_at IS NULL`).

### 7. Performance & DRY

- All list endpoints go through a small set of RPCs that pre-join and pre-aggregate — no client-side aggregation, no N+1.
- Counters cached on `recruitment_campaign_links` and updated in the same transaction as clicks/registrations.
- Indexes listed above; pagination + range keyset on `(agent_id, created_at desc)` for the agent links table.
- Shared React Query keys + a single `useAgentCampaignDashboard` / `useAdminCampaignAnalytics` hook so components don’t refetch overlapping data.
- Reused components: existing `Card`, `Table`, `Sheet`, `PaginationBar`, `SearchInput`, `EmptyState`, `ErrorState`, `LoadingSkeleton`, `FormattedUGX`.

## Out of scope for Phase One

- Any new reward money flow (reuse existing UGX 10,000).
- GPS / device location prompts.
- Deep fingerprinting or bot-mitigation beyond visitor cookie + ip_hash.
- Exportable CSV/PDF reports (can be added Phase Two).
- Multi-language / translations for the redirect landing page.

## Rollout order

1. Migration (tables, enums, RPCs, triggers, seeds, GRANTs, RLS).
2. `campaign-redirect` + `resolve-campaign-ref` + `attach_campaign_registration` edge/RPCs.
3. Agent dashboard (Campaign Tracking route + generate-link dialog + links table + per-link analytics).
4. Admin dashboard (campaign CRUD + analytics + funnel).
5. Hook registration form + house-verification trigger.
6. Smoke test end-to-end on `/c/mbale/{code}` with a seeded campaign and location.

## Technical notes

- Short codes: 8 chars, `[A-Za-z0-9]` from `gen_random_bytes`, uniqueness enforced by unique index with retry loop in `create_campaign_link`.
- Cookies: `wr_visitor` (uuid) + `wr_ref` (HMAC-signed compact JSON) — signed with existing `APP_JWT_SECRET`.
- All new tables get `service_role` + `authenticated` GRANTs per policy set; no `anon` grants; anon flow is edge-function-only.
- Every write path uses a `SECURITY DEFINER` RPC with `SET search_path = public` and validates `auth.uid()` against the acting agent.

Ready to build on approval.