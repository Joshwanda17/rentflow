---
name: Welile Mission Board
description: Top-of-page priority panel on the Welile Operations hub tracking the 3 current company priorities — list empty houses, place tenants, onboard funders — with a supply→placement funnel, live recommendation engine, and per-agent leaderboard
type: feature
---
Placement: very top of `WelileOperationsHub` (Tenant Ops → Welile Operations), above the Operations Counter Band. Component `src/components/executive/tenant-ops/WelileMissionBoard.tsx`.

Purpose: makes the three ranked priorities explicit and tells ops the single best next move from live data.
- Priority 1 `list` — agents register landlords with empty houses (`house_listings`, status<>'rejected').
- Priority 2 `place` — agents move tenants into listed houses (`house_listings.tenant_id` set).
- Priority 3 `fund` — onboard funders + promissory notes (`promissory_notes`).

Window filter: 7d / 30d / All (default 7d). Optional 15s live auto-refresh.

RPCs (SECURITY DEFINER, search_path=public, gated by `is_ops_role(auth.uid())`):
- `welile_mission_summary(p_since)` — single row: empty_houses_total (tenant_id null, not rejected, not hidden — all-time inventory), listings_new, listing_agents, placements_new (placement_bonus_paid_at/updated_at in window), placements_total, placement_agents, promissory_new, promissory_total, promissory_activated (partner_user_id set OR status in active/activated/approved), promissory_amount (sum amount in window).
- `welile_mission_leaderboard(p_since)` — per agent across all 3 priorities: listings_count, empty_listings, placements_count, promissory_count, promissory_amount, last_activity. Union of house_listings.agent_id + promissory_notes.agent_id, joined to profiles. Ordered by total contribution. limit 200.
- `welile_mission_empty_houses(p_since)` — exact vacant listings (tenant_id null, status<>rejected, not hidden): listing_id, title, status, monthly_rent, number_of_rooms, area (concat village/sub_county/district/region), region, district, created_at, last_activity (greatest created/updated), verified, landlord_id/name/phone (left join landlords; null = not onboarded), agent_id/name/phone (left join profiles). Ordered by monthly_rent desc then last_activity desc. limit 500.

Hooks in `src/hooks/useWelileOpsCounters.ts`: `useMissionSummary(win)`, `useMissionLeaderboard(win, enabled)`, `useMissionEmptyHouses(win, enabled)` + types `MissionSummary`, `MissionAgentRow`, `MissionEmptyHouseRow`.

UI: 3 priority cards (rank badge + big metric + sub-metric); supply→placement funnel (listed → still empty → placed, with % occupied); recommendation card (`recommend()` picks the most blocking gap → text + severity good/watch/act, highlights the focus priority card with "Focus now"); agent leaderboard with search + sort (Listed/Placed/Funders), row click opens `UserDrilldownDrawer` on agent tab. Amounts formatted via `formatUGX`.

Empty Houses drill-down (`EmptyHousesDialog`): opened from the "View empty houses to fill" button on Priority 1 card AND the clickable "Still empty" funnel tile. Lists each vacant unit with status badge, area, rent, rooms, last activity; search (area/landlord/agent) + sort (Rent/Recent/Oldest/Area); flags units with no onboarded landlord ("Landlord not onboarded", counted in a header badge) so ops can target high-impact landlords. Landlord/agent chips open `UserDrilldownDrawer` on the respective tab.
