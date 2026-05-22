# Booking.com-Style House-by-Location Browser

A scalable drill-down explorer for managing houses across 54 countries, with server-side aggregation, global search, and map view — built to handle millions of listings without loading them client-side.

## What the user sees (Booking.com pattern)

```text
┌─────────────────────────────────────────────────────────┐
│  🔍  Search any country, city, agent, landlord…         │
└─────────────────────────────────────────────────────────┘

[ Grid ] [ Map ]   Breadcrumbs: All › Uganda › Central › Kampala

┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  Uganda  │ │  Kenya   │ │ Nigeria  │ │  Ghana   │  ← tiles
│ 12,430   │ │  8,210   │ │ 24,005   │ │  3,118   │     show total
│ 78% occ  │ │ 65% occ  │ │ 71% occ  │ │ 82% occ  │     + occupancy
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

Click a tile → fetches the next level (region → city → ward → agent → landlord → property). Each level loads only ~20-200 rows. Memory stays flat.

## Architecture (the part that makes it scale)

### 1. Server-side rollup view
Single materialized view aggregating `house_listings`:
```text
mv_house_location_rollup
  country, region, district, ward,
  agent_id, landlord_id,
  total, occupied, vacant, hidden, revenue_ugx
```
Refreshed by `pg_cron` every 10 minutes. Indexed on every level.

### 2. One RPC for drill-down
`get_location_breakdown(p_level, p_country, p_region, p_district, p_ward, p_agent_id)`
- Returns aggregated rows for the NEXT level only
- Filters honor RLS scope (`landlord_ops_scope`)
- Sub-100ms even with millions of listings

### 3. Global search RPC
`search_locations(p_query, p_limit)` → unified results across countries, regions, cities, agents, landlords. Lets ops jump straight to any node (the Booking.com search bar feel).

### 4. Map view
Africa choropleth using the Google Maps connector (already available). Click country → zoom region → markers cluster at city level. Toggle Grid ↔ Map.

### 5. Final level: properties
At the leaf, paginated property list (20/page) with virtualization. Click a property → existing detail/edit drawer.

## Component plan

**New files**
- `supabase/migrations/<ts>_location_rollup.sql` — MV + indexes + cron + RPCs (`get_location_breakdown`, `search_locations`, `refresh_house_location_rollup`)
- `src/components/executive/landlord-ops/LocationBrowser.tsx` — root: search bar + view toggle + breadcrumbs + grid/map switch
- `src/components/executive/landlord-ops/LocationTileGrid.tsx` — virtualized responsive tiles (12-col → 2-col mobile)
- `src/components/executive/landlord-ops/LocationSearchBar.tsx` — debounced autocomplete calling `search_locations`
- `src/components/executive/landlord-ops/LocationMapView.tsx` — Google Maps with cluster markers
- `src/components/executive/landlord-ops/LocationBreadcrumbs.tsx` — clickable trail with back
- `src/components/executive/landlord-ops/PropertyLeafList.tsx` — paginated property results at the bottom level
- `src/hooks/useLocationBreakdown.ts` — React Query hook keyed by path, `staleTime: 5min`
- `src/hooks/useLocationSearch.ts` — debounced search hook

**Edited**
- `src/components/executive/landlord-ops/LandlordHousesPanel.tsx` — replace the recursive `LocationHierarchyView` with `<LocationBrowser />` when `viewMode === 'location'`. Keep landlord view untouched.

## UX details that matter at this scale

- **Skeleton tiles** while a level loads — never blank screen
- **Sticky breadcrumbs + search bar** at top so navigation is always one click away
- **"Pinned countries"** (localStorage) for ops who manage a subset — surfaces first
- **Counts pills**: Total · Occupied · Vacant · Hidden — color-coded
- **Empty states** ("No houses in this ward yet") with a "List one" CTA
- **Keyboard**: `/` focuses search, `Esc` clears, `Backspace` goes up a level
- **Mobile**: tiles collapse to 2-column; map becomes default on small screens

## Performance & safety

- RLS on the breakdown RPC respects existing landlord-ops permissions
- React Query caches per breadcrumb path → revisiting a country is instant
- Map markers cluster (no DOM blow-up over 1k pins)
- No client-side hierarchy tree; nothing is built in memory beyond the current level
- MV refresh is cheap (incremental aggregation) and runs on cron, not on every read

## Build order (single PR)

1. Migration: MV + 2 RPCs + cron
2. Hooks: `useLocationBreakdown`, `useLocationSearch`
3. Components: Browser → Tiles → Search → Breadcrumbs → Leaf list
4. Map view (Google Maps connector)
5. Wire into `LandlordHousesPanel` behind the existing "Location" toggle
6. Verify with current data (Uganda only today; future-proof for all 54 countries)

After approval I'll implement it end-to-end in one go.