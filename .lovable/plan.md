

# Tap-to-Drill Modals for Brief Cards

Add a drill-down modal triggered by tapping any of the 4 brief cards on the Agent Ops dashboard. Each modal shows the actual records behind the metric, updates live via Supabase Realtime, and respects the active date range (24H / 7D / 1M).

## What you'll see

Tap a card → a sheet/dialog slides up with:
- **Header**: metric title, big number, % change, range badge, a pulsing "Live" dot.
- **Mini sparkline** (same series as the card) for context.
- **Records list**: the actual rows backing the number, newest first, paginated 25 at a time with "Load more".
- **Realtime ticker**: when a new matching row arrives, it animates in at the top with a subtle highlight; the header count auto-increments.
- **Row tap**: opens the relevant detail (agent profile / rent request / earning entry) using existing routes where available.

## Per-card drill-downs

| Card | Records shown | Source | Row content |
|------|---------------|--------|-------------|
| New Agents Onboarded | New agents in range | `user_roles` (role=agent) joined to `profiles` | Avatar, name, phone, joined-at relative time |
| Rent Requests | Requests created in range | `rent_requests` joined to `profiles` (tenant) | Tenant name, amount (UGX), status pill, created-at |
| Commission Earned | Earnings posted in range | `agent_earnings` joined to `profiles` (agent) | Agent name, amount (UGX), source/category, created-at |
| Active Agents | Agents with `last_active_at` in range | `profiles` filtered by role=agent | Avatar, name, last-active relative time, status dot |

Each modal also shows totals (count + sum where applicable) and a "View full section" button that calls the existing `onOpenSection` (directory / pipeline / earnings) for deeper management.

## Realtime behavior

- Each modal opens its own scoped Supabase channel filtered to the table it cares about, so events don't leak across modals.
- New INSERTs that fall inside the current range are prepended with a 1.5s highlight pulse.
- UPDATEs (e.g. rent request status change) update the row in place.
- Channel is torn down on close to avoid lingering subscriptions.

## Empty / loading / error states

- Skeleton rows while loading (5 placeholders).
- Empty state: friendly icon + "No [metric] in this window yet. New entries appear here live."
- Error state: retry button.

## Mobile-first UX

- Uses a bottom **Sheet** on mobile (`<640px`), centered **Dialog** on desktop — both already in the design system.
- 85vh max height, internal scroll, sticky header with close button.
- Touch-friendly 44px min row height; tap row = drill deeper.

## Technical plan

**New files**
- `src/components/executive/agent-ops-v2/BriefDrillDownModal.tsx` — generic modal shell (header, sparkline, list container, realtime wiring). Props: `open`, `onOpenChange`, `metric` (`'new-agents' | 'rent-requests' | 'commission' | 'active-agents'`), `range`, `series`, `kpi`, `onOpenSection`.
- `src/components/executive/agent-ops-v2/drill/NewAgentsList.tsx`
- `src/components/executive/agent-ops-v2/drill/RentRequestsList.tsx`
- `src/components/executive/agent-ops-v2/drill/CommissionList.tsx`
- `src/components/executive/agent-ops-v2/drill/ActiveAgentsList.tsx`

Each list component owns its own `useQuery` (paginated via `range(from, to)`) + a Realtime subscription. They expose a consistent row renderer.

**Modified files**
- `src/components/executive/agent-ops-v2/AgentOpsHomeView.tsx`:
  - Replace each card's `onClick: () => onOpenSection(...)` with `onClick: () => setActiveDrill(metricKey)`.
  - Add `<BriefDrillDownModal>` at the bottom, controlled by `activeDrill` state.
  - Keep `onOpenSection` as the secondary "View full section" CTA inside each modal.

**No DB migration needed** — realtime publication for `user_roles`, `rent_requests`, `agent_earnings` was already enabled in Phase 1. We'll add `profiles` to the publication only if active-agents realtime requires it (will check before adding).

**Performance**
- Page size 25, fetched server-side with `.range()`.
- Realtime payloads are filtered client-side against the active range to avoid stale inserts polluting the list.
- Modal queries use a separate `queryKey` (`['agent-ops-drill', metric, range, page]`) so they don't conflict with the card aggregates.

