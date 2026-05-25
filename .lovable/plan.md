## Goal

Make Tenant Ops genuinely usable when there are 1,000,000+ tenants. Replace the current "18-view sprawl" with a 3-tab shape that the manager can work in for the entire shift without ever feeling lost. Treat Tenant Ops as the **reference pattern**; once approved and proven, replicate the exact same shape (different data) to Agent Ops and Landlord Ops in a follow-up plan.

## The 3-tab shape (locked across all three dashboards)

```text
┌─ Tenant Ops ──────────────────────────────────────────────┐
│  [INBOX]   [SEGMENTS]   [SEARCH]            ⚙ Saved views │
├───────────────────────────────────────────────────────────┤
│                                                            │
│  (Tab body — see below)                                    │
│                                                            │
└───────────────────────────────────────────────────────────┘
       ↳ click any row → BEHAVIOR DRAWER slides in from right
```

### Tab 1 — Inbox (default landing)

The only place that's realtime. Answers "what do I act on right now?"

- **5 severity buckets**, shown as horizontal pills with live counts:
  `🔴 Critical · 🟠 At-risk · 🟡 Watch · 🔵 New · ⚪ Snoozed`
- Each bucket opens a virtualised list of action cards (not table rows). Card shows:
  name + phone, one-line **reason** ("4 days overdue, no agent visit in 7d, trust −12"), trend arrow, and 3 verbs: **Act · Snooze · Escalate**.
- "Act" opens the existing TenantDetailPanel inside a drawer (no route change).
- Snoozing writes to a new `ops_inbox_state` row keyed on (ops_user, tenant_id) and removes the card for 24h.
- Realtime: subscribe only to `ops_inbox_events` (one row per bucket-change), not to `profiles` or `rent_requests`.

### Tab 2 — Segments

The bulk-action surface. Not realtime; refresh button + 60s poll.

- Left rail: list of **saved smart segments** (e.g. "Kampala · overdue 3+ days · no agent · trust < 500"). Ships with 6 starter segments.
- Main area: virtualised list (TanStack Virtual) over a single keyset-paginated RPC `ops_query_tenants(segment_id, cursor, limit)`.
- Top bar shows row count from `mv_tenant_segment_counts` (refreshed every 5 min), so the manager always sees scale honestly ("48,213 tenants match").
- Bulk actions on the current segment: SMS blast, assign agent, mark for visit, export CSV — all already-existing flows wired to a "Selected: N / All N" toggle.

### Tab 3 — Search

One-record lookup. Same input field as today's AgentTenantSearch, server-side ILIKE on phone/name/national-id with a 25-result cap and a "view all matches in Segments" link.

### Behavior drawer (shared primitive — Tenant Ops ships it, others reuse)

Slides in over any row in any tab. Six fixed sections, top to bottom:

1. **Header** — avatar, name, phone, trust score with 30-day delta arrow.
2. **Trend strip** — 30-day sparkline: payments made vs. expected.
3. **Cohort** — "This tenant vs. neighbourhood median" mini bar (paid %, on-time %, days-since-visit).
4. **Trust factor breakdown** — 6 factors from `welile_trust_score_cache` with last-7d delta per factor.
5. **Last 5 events** — pulled from `system_events` for this user, newest first.
6. **Verbs** — same Act / Snooze / Escalate / Open full profile.

## Build order (Tenant Ops only — Agent + Landlord come later)

1. **Backend foundations** (one migration)
   - `ops_inbox_state` table (ops_user_id, tenant_id, snoozed_until, escalated_at).
   - `ops_saved_segments` table (owner, name, filter_json, is_starter).
   - `mv_tenant_segment_counts` materialised view + nightly refresh cron.
   - RPC `ops_tenant_inbox(p_ops_user, p_bucket, p_limit, p_cursor)` returning ranked tenants with `reason`, `severity`, `trust_delta_30d`.
   - RPC `ops_query_tenants(p_segment_id, p_cursor, p_limit)` keyset-paginated.
   - RPC `ops_tenant_behavior(p_tenant_id)` returning the 6 drawer sections as one JSON payload.
   - Seed 6 starter segments.

2. **Shared primitives** (new files)
   - `src/components/ops/OpsShell.tsx` — the 3-tab frame.
   - `src/components/ops/InboxBucketList.tsx` — virtualised action cards.
   - `src/components/ops/SegmentBrowser.tsx` — left rail + virtualised list + bulk action bar.
   - `src/components/ops/BehaviorDrawer.tsx` — the shared drawer.
   - `src/hooks/useOpsInbox.ts`, `useOpsSegment.ts`, `useTenantBehavior.ts`.

3. **Tenant Ops rewrite**
   - New `TenantOpsDashboardV2.tsx` composes `OpsShell` + tenant-flavoured inbox reasons + tenant segments.
   - Keep the existing `TenantOpsDashboard.tsx` reachable behind a "Classic view" toggle for one release so nothing is lost.
   - Mobile-first: the 3 tabs collapse to a bottom tab bar; segment left-rail becomes a top dropdown.

4. **QA at scale**
   - Seed 10,000 fake tenants in a `pg_temp` script run locally; verify inbox + segment paginate without timeouts.
   - Verify Realtime stays under 1 subscription per ops session.

## What we explicitly do NOT do in this plan

- We do **not** touch Agent Ops or Landlord Ops. Those get their own plans once Tenant Ops is validated in production.
- We do **not** change any ledger, wallet, or rent-pipeline logic. UI only + new ops-scoped tables + 3 read-only RPCs.
- We do **not** delete the existing TenantOpsDashboard component yet — kept behind a toggle.

## Technical details

- **Virtualisation**: `@tanstack/react-virtual` (already in tree).
- **Realtime channel**: single `ops:inbox:{ops_user_id}` channel, fanned out from one `ops_inbox_events` table (insert per severity-bucket change) — avoids subscribing to large mutable tables.
- **Severity ranking**: computed server-side from existing signals — `rent_requests.days_overdue`, `welile_trust_score_cache.score_delta_7d`, `agent_visits.last_at`, `wallets.advance_balance`. No new scoring logic.
- **RLS**: all 3 RPCs `SECURITY DEFINER SET search_path = public`, gated by `has_role(auth.uid(), ANY('manager','operations','coo','super_admin'))`.
- **Starter segments** (seeded): Overdue 3+ days · Overdue 7+ days no visit · New (last 7d) unverified · Trust drop ≥10 in 7d · Advance balance > 0 with no payment in 14d · Kampala overdue.

## Acceptance

- A manager can land on Tenant Ops, see ≤ 50 cards across 5 buckets, and act on the top one without scrolling.
- A manager can run a saved segment over 48k+ tenants and bulk-SMS them in ≤ 3 clicks.
- Opening the Behavior drawer on any tenant loads in ≤ 800ms (single RPC).
- Old TenantOpsDashboard still reachable via "Classic view" toggle for one release.

Approve this and I'll start with the migration + shared primitives.
