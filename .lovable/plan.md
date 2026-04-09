

# Fix CFO Dashboard Mobile Layout

## Problems Identified (from screenshot at 390px)

1. KPI header cards: `text-2xl` values overflow on mobile — currency strings like "USh 96,843,218" don't fit in a 2-column grid
2. Channel balance cards: Same overflow issue with large numbers
3. Solvency ratio card uses same oversized text
4. Various `font-mono text-lg`/`text-2xl`/`text-3xl` values throughout sections clip on small screens

## Fix Strategy

All changes in **one file**: `src/components/cfo/CFOOverviewDashboard.tsx`

### 1. KPICard component — responsive text sizing
- Change value from `text-2xl` to `text-base sm:text-2xl`
- Add `truncate` to prevent overflow
- Reduce padding on mobile: `p-3 sm:p-4`

### 2. Solvency ratio card (line 97-108) — same responsive sizing
- Value: `text-base sm:text-2xl`
- Reduce padding on mobile

### 3. Section content — responsive number sizing
- "Total Cash" hero number (line 123): `text-xl sm:text-3xl`
- Channel cards values (line 134): `text-base sm:text-lg`
- Channel card In/Out text: add `truncate`
- All section hero numbers (Total Receivables, etc.): `text-xl sm:text-3xl`
- MiniKPI values: `text-base sm:text-lg`

### 4. Liability grid (line 191)
- Change from `grid-cols-2 lg:grid-cols-5` to `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5` so items stack on very small screens

### 5. Cash Flow section Net Cash Movement (line 285)
- `text-xl sm:text-2xl`

No structural changes — purely responsive text sizing and overflow prevention.

