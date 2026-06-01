---
name: Welile Mission Board
description: Top-of-page priority panel on the Welile Operations hub tracking the 3 current company priorities — list empty houses, place tenants, onboard funders — with a supply→placement funnel, live recommendation engine, and per-agent leaderboard
type: feature
---
Placement: very top of `WelileOperationsHub` (Tenant Ops → Welile Operations), above the Operations Counter Band. Component `src/components/executive/tenant-ops/WelileMissionBoard.tsx`.

Purpose: makes the three ranked priorities explicit and tells ops the single best next move from live data.
- Priority 1 `list` — agents register landlords with empty houses (`house_listings`, status<>'rejected').
- Priority 2 `place` — placed tenants = occupied houses = `landlords` rows with `tenant_id` set (NOT `house_listings.tenant_id`, which is effectively empty in production). Real placement signal.
- Priority 3 `fund` — onboarded funders = `investor_portfolios` (Partner Ops) + `promissory_notes` combined.

Window filter: 7d / 30d / All (default 7d). Optional 15s live auto-refresh.

RPCs (SECURITY DEFINER, search_path=public, gated by `is_ops_role(auth.uid())`):
- `welile_mission_summary(p_since)` — single row: empty_houses_total (tenant_id null, not rejected, not hidden — all-time inventory), listings_new, listing_agents, placements_new (placement_bonus_paid_at/updated_at in window), placements_total, placement_agents, promissory_new, promissory_total, promissory_activated (partner_user_id set OR status in active/activated/approved), promissory_amount (sum amount in window).
- `welile_mission_summary(p_since)` — single row: empty_houses_total (house_listings vacant inventory), listings_new, listing_agents; placements_new/placements_total/placement_agents now from `landlords` where tenant_id not null (created_at window, distinct registered_by); funders_new/funders_total/funders_activated/funders_amount = `investor_portfolios` (+cfo_verified for activated, investment_amount for amount) PLUS `promissory_notes` (+activated/amount). Replaced the old promissory_* fields with funders_*.
- `welile_mission_leaderboard(p_since)` — per agent across all 3 priorities: listings_count, empty_listings, placements_count, promissory_count, promissory_amount, last_activity. Union of house_listings.agent_id + promissory_notes.agent_id, joined to profiles. Ordered by total contribution. limit 200.
- `welile_mission_empty_houses(p_since)` — exact vacant listings (tenant_id null, status<>rejected, not hidden): listing_id, title, status, monthly_rent, number_of_rooms, area (concat village/sub_county/district/region), region, district, created_at, last_activity (greatest created/updated), verified, landlord_id/name/phone (left join landlords; null = not onboarded), agent_id/name/phone (left join profiles). Ordered by monthly_rent desc then last_activity desc. limit 500.
- `welile_mission_placements(p_since)` — occupied houses: landlords with tenant_id. Returns landlord_id/name/phone, property_address, monthly_rent, verified, tenant_id/name/phone (join profiles), agent_id/name/phone (registered_by → profiles), created_at. Ordered created_at desc, limit 500.
- `welile_mission_funders(p_since)` — union of investor_portfolios (`portfolio:<id>` key, investor profile name/phone, investment_amount, cfo_verified→activated, portfolio_code→reference) and promissory_notes (`promissory:<id>` key, partner_name/phone, amount, activated via partner_user_id/status). Fields: funder_key, source, name, phone, amount, status, activated, reference, agent_id/name, investor_id, created_at. Ordered created_at desc, limit 500.

Hooks in `src/hooks/useWelileOpsCounters.ts`: `useMissionSummary(win)`, `useMissionLeaderboard(win, enabled)`, `useMissionEmptyHouses(win, enabled)`, `useMissionPlacements(win, enabled)`, `useMissionFunders(win, enabled)` + types `MissionSummary` (funders_* fields), `MissionAgentRow`, `MissionEmptyHouseRow`, `MissionPlacementRow`, `MissionFunderRow`.

Drill-downs: Priority 2 card "View placed tenants" + funnel "Tenants placed" tile open `PlacedTenantsDialog` (landlord/tenant/agent chips → UserDrilldownDrawer, search + sort Recent/Rent/Name). Priority 3 card "View onboarded funders" opens `FundersDialog` (search, sort Recent/Amount/Name, source filter All/Portfolios/Notes, activated badge, agent chip → drawer).

UI: 3 priority cards (rank badge + big metric + sub-metric); supply→placement funnel (listed → still empty → placed, with % occupied); recommendation card (`recommend()` picks the most blocking gap → text + severity good/watch/act, highlights the focus priority card with "Focus now"); agent leaderboard with search + sort (Listed/Placed/Funders), row click opens `UserDrilldownDrawer` on agent tab. Amounts formatted via `formatUGX`.

Empty Houses drill-down (`EmptyHousesDialog`): opened from the "View empty houses to fill" button on Priority 1 card AND the clickable "Still empty" funnel tile. Lists each vacant unit with status badge, area, rent, rooms, last activity; search (area/landlord/agent) + sort (Rent/Recent/Oldest/Area); flags units with no onboarded landlord ("Landlord not onboarded", counted in a header badge) so ops can target high-impact landlords. Landlord/agent chips open `UserDrilldownDrawer` on the respective tab.

One-click onboarding targeting: each empty-house row with a registered landlord shows a full-width "Target landlord & open profile" button. It upserts a `landlord_onboarding_targets` row (status `targeted`) and opens the landlord `UserDrilldownDrawer`. Already-targeted landlords show "Targeted — open profile" with a check; a header badge counts targeted landlords. Table `landlord_onboarding_targets` (landlord_id unique, listing_id, status, note, targeted_by) is RLS-gated to `is_ops_role`. Hooks: `useLandlordOnboardingTargets(enabled)` (returns map keyed by landlord_id) + `useTargetLandlordForOnboarding()` (upsert callback) in `useWelileOpsCounters.ts`.
