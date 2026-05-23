# Plan: Payment Calendar Streak in Tenant Detail (Agent)

## Goal
When an agent taps a tenant's name under "My Tenants" and opens the tenant detail view (`TenantProfileView`), show a month-grid calendar that visualizes — for each day of the tenant's active rent plan — whether they **paid in full**, **paid partially**, **missed**, or it's **upcoming / outside the plan window**.

## Where it goes
- File: `src/components/agent/TenantProfileView.tsx` — already loads `repayments` (last 50) and `requests` (rent plans). Insert the new calendar inside the existing "Payment History" / repayments area (around line ~1412, right above the existing flat list of repayments) so the streak is the first thing the agent sees, with the existing list still available below.
- New presentational component: `src/components/agent/TenantPaymentCalendar.tsx` — pure UI, no data fetching; receives props from `TenantProfileView`.

## What it shows
Per active rent plan (the most recent `repaying` / `disbursed` / `funded` request, with fallback to most recent completed):
- Plan window = `disbursed_at` → `disbursed_at + duration_days` (or `created_at` if no `disbursed_at`).
- Daily expected = `daily_repayment` from the request (already normalized by `getEffectiveRentRequestAmounts`).
- For each day in the window:
  - Sum `repayments` whose `created_at` falls on that local day AND `rent_request_id` matches the active plan.
  - Status:
    - `paid` (green) — sum ≥ daily expected.
    - `partial` (amber) — 0 < sum < daily expected.
    - `missed` (red) — day is in the past, sum = 0.
    - `today` (ring highlight, colored by actual status).
    - `upcoming` (muted) — day in the future, within plan window.
    - `outside` (hidden / very muted) — calendar cell that falls outside the plan window for the month being viewed.

## Layout
- Compact month-grid (Mon–Sun columns, ~28×28px cells), with prev/next month chevrons. Default month = month containing today (clamped to plan window).
- Header chips: `🔥 Current streak: N days`, `Best: M days`, `Paid X / Y days`, `Collected UGX … / Expected UGX …` for the visible window.
- Legend row: Paid / Partial / Missed / Upcoming, using existing semantic tokens (`bg-success`, `bg-warning`, `bg-destructive`, `bg-muted`).
- Tap a cell → small popover/tooltip showing date, expected amount, collected amount, and a "Collect now" shortcut that opens the existing `AgentTenantCollectDialog` pre-filled to that tenant (reuse `setCollectDialogOpen(true)` already in the file). No new backend wiring.
- Empty state: if no active plan, show a single line — "No active rent plan to chart yet."

## Streak math
- Current streak = consecutive `paid` days ending at the latest non-future day in the plan window. `partial` breaks the streak (same as the existing platform behavior — daily expectation is the bar).
- Best streak = longest run of consecutive `paid` days anywhere in the plan window.
- Both computed client-side in `useMemo` from the already-loaded `repayments` array — no new queries.

## Data sources (already loaded, no new fetch)
- `requests` (active rent plan: `disbursed_at`, `duration_days`, `daily_repayment`, `id`).
- `repayments` (`amount`, `created_at`, `rent_request_id`).

If the active plan is longer than 50 days and the agent pages backward into months not covered by the existing 50-row repayment fetch, we'll bump the existing `repayments` query `.limit(50)` → `.limit(400)` (covers >1 year of daily collections) in the same file. No schema or RPC changes.

## Design system
- All colors via semantic tokens (`success`, `warning`, `destructive`, `muted`, `primary`) — no hardcoded hex.
- Reuses existing `Badge`, `Button`, `formatUGX`, `date-fns`. No new dependencies.
- Mobile-first: grid scales down to 24px cells under 360px; header chips wrap.

## Out of scope (not changing)
- No edits to backend, RPCs, ledger, or other dashboards.
- No change to the existing flat repayments list below — calendar is added above it.
- No change to `AgentTenantsSheet` list itself; only the detail view it opens.

## Technical notes
- Day bucket key: `format(new Date(r.created_at), 'yyyy-MM-dd')` in the browser's local TZ — matches how today/collected_today are already computed elsewhere in this file.
- Match repayments to the active plan by `rent_request_id === activeRequest.id` so payments on previous plans don't pollute the current streak.
- Calendar starts on Monday to match existing date pickers in `ui/calendar.tsx`.

## Files touched
- **New**: `src/components/agent/TenantPaymentCalendar.tsx`
- **Edited**: `src/components/agent/TenantProfileView.tsx` (import + render the calendar above the repayments list; bump repayments `.limit(50)` to `.limit(400)`).
