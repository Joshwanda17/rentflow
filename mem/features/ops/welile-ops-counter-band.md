---
name: Welile Operations Counter Band
description: Always-visible top-of-page counter band on the Welile Operations hub showing new rent requests / agent-listed landlords / agent-registered agents / partner promissory notes, drillable continent→country→city→agent→list→profile
type: feature
---
Placement: top of `WelileOperationsHub` (Tenant Ops → Welile Operations), always visible.
Window filter: 7d / 30d / All (default 7d).

Geo source: ALL four counters are attributed to the registering/listing AGENT and geography is derived from that agent's `profiles` row. Continent is computed from country via `country_to_continent(text)` (immutable). City/town = coalesce(profiles.town, profiles.city, 'Unspecified'). Country well-populated (~99% of agents); continent/town sparse so most fall to Africa/Unspecified — honest to real data.

RPCs (SECURITY DEFINER, search_path=public, gated by `is_ops_role(auth.uid())`):
- `welile_ops_counter_breakdown(p_level, p_continent, p_country, p_city, p_since)` — pivots counts per next bucket. raw union: rent_requests.agent_id (rent), landlords.registered_by (landlord), profiles.referrer_id where both child & referrer are agents (agent), promissory_notes.agent_id (promissory). Also returns funnel/activation health: `rent_funded_count` (rent requests where funded_at not null OR status in funded/repaying/completed), `distinct_agents` (distinct contributing agents in bucket), `active_agents` (distinct contributing agents with ≥1 funded rent request).
- `welile_ops_counter_items(p_agent_id, p_kind, p_since)` — source list per agent+kind, returns profile_id + drawer_tab (rent→tenant, landlord→landlord, agent→agent, promissory→tenant). limit 500.

Health layer (Booking funded% + Airbnb activation), computed client-side in the band:
- Funded% = rent_funded_count / rent_count. healthTone: ≥70% Healthy (emerald), ≥40% Watch (amber), <40% Stalled (red), no demand = muted.
- Activation% = active_agents / distinct_agents ("agents producing").
- Surfaced as two aggregate cards under the summary tiles, plus per-zone funded% bar + producing ratio + health badge on every breakdown row.

Frontend: hook `src/hooks/useWelileOpsCounters.ts`, component `src/components/executive/tenant-ops/WelileOpsCounterBand.tsx`. Profiles open via shared `UserDrilldownDrawer`.
