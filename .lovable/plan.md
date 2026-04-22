

## Agent Performance Booster — "Good tenants raise your trust score & your vouch limit"

### The idea (one paragraph)
Today an agent's trust score gets a tiny network bonus (≤2 pts) just for *having* tenants — quantity, not quality. We add a brand-new **Agent Performance** factor that rewards an agent when their tenants are actually paying. Every agent's `welile_trust_score_cache` row will carry this signal, and because `borrowing_limit_ugx` is derived from cash-flow capacity, **a high-performing agent's vouch limit grows automatically** alongside their score.

### How "good tenant" is measured
For each active tenant (`rent_requests` rows where `agent_id = agent`, `status IN ('disbursed','funded','approved')`, `tenancy_status='active'`, disbursed > 30 days ago):

```
expected_30d  = daily_repayment × 30
collected_30d = amount_repaid_in_last_30d   (delta vs. snapshot 30 days ago)
performance   = collected_30d / expected_30d        (capped at 1.0)
```

Tenant is "**healthy**" when `performance ≥ 0.50`.

Agent-level:
```
healthy_ratio = healthy_tenants / qualifying_tenants    (ignore tenants <30d old)
collection_rate = SUM(collected_30d) / SUM(expected_30d) across all qualifying tenants
qualifying_tenants must be ≥ 3 for the bonus to count (statistical floor)
```

### New scoring factor — Agent Performance (10 pts), inside Network band
We rebalance the existing 100-pt scale by carving 10 pts out of Network (25 → 15) so the total stays 100 and we don't quietly inflate scores. New weights:

| Factor | Old | New |
|---|---|---|
| Supporter | 30 | 30 |
| Payment (own rent) | 15 | 15 |
| Wallet | 10 | 10 |
| Network | 25 | **15** |
| **Agent Performance** | — | **10** *(new)* |
| Verification | 10 | 10 |
| Behavior | 5 | 5 |
| Landlord | 5 | 5 |

Score formula:
```
agent_perf_score =
    LEAST(6, healthy_ratio × 6)              -- up to 6 pts for ≥80% healthy
  + LEAST(3, collection_rate × 3)            -- up to 3 pts for full collection
  + LEAST(1, LOG(qualifying_tenants) × 0.5)  -- up to 1 pt for portfolio breadth
```
Non-agents simply get 0 here — the factor is dormant for tenants/supporters/landlords.

A new "Top Performing Agent" badge fires when `healthy_ratio ≥ 0.80 AND qualifying_tenants ≥ 10`.

### How the **vouch limit** grows
`borrowing_limit_ugx` already takes `GREATEST(rent_paid×0.5, portfolio×0.6, monthly_cashflow×0.5)`. We add a fourth term so good agents directly unlock more vouch capacity:

```
agent_book_value = SUM(expected_30d) over qualifying tenants    -- monthly book
agent_term       = agent_book_value × healthy_ratio × 0.4        -- 40% of healthy book
```
Final: `borrowing_limit_ugx = GREATEST(existing 3 terms, agent_term)`.

Example: agent has 20 tenants with avg daily 5,000 → monthly book 3M; 85% healthy → vouch limit ≥ **UGX 1.02M** purely from agent performance, on top of their other signals.

### Where the data lives — minimal new surface area
Single new helper SQL function `compute_agent_performance(p_agent_id uuid)` returning a row `(qualifying_tenants, healthy_tenants, healthy_ratio, collection_rate, monthly_book)`. Called from inside the existing `get_user_trust_profile` so:
- No new table, no new cron — the **existing** nightly `recompute_trust_scores_batch` already refreshes `welile_trust_score_cache` for every user.
- Public profile (`/id/:aiId`) and Vouch Network read the same `borrowing_limit_ugx` they read today → vouch coverage scales automatically.

To keep the calc cheap at 40M-user scale we use a 30-day window with a single grouped query over `rent_requests` (already indexed on `agent_id`) and store `agent_performance` snapshot inside `welile_trust_score_cache.breakdown` JSONB — no schema change.

### UI surfacing (read-only of the new breakdown)
1. **`TrustScoreCard`** — add an 8th breakdown row "Agent Performance" with progress bar and inline subtitle *"X of Y tenants paying ≥50% of daily expectation"*. Renders only when `agent_perf_score > 0` OR primary role is agent.
2. **`HolisticProfile.tsx` (public AI ID page)** — show "Top Performing Agent" badge next to name when earned, plus a small stat strip: *"Manages 18 tenants · 85% paying on schedule · UGX 1.5M Welile vouch"*.
3. **Agent dashboard hero** — a new tiny card under the wallet hero: *"Tenant Health 85% — your vouch limit grew to UGX X"* with a subtle trend arrow vs. last refresh.
4. **`TrustBoostSuggestions`** — for agents below 50% healthy ratio, surface action *"Visit late-paying tenants — capture a trust signal to nudge collections"* linking to Agent Ops Trust Capture.
5. **CEO Dashboard `TrustCoverageSection`** — add KPI tile *"Agent Tenant Health" (network-weighted average)*.

### Why this is the right shape
- **One source of truth.** Agent quality flows through the same trust pipeline lenders already trust; no parallel ranking system.
- **Scales linearly.** Single grouped query per agent during nightly batch; cache-only reads at request time.
- **Self-correcting.** When a tenant stops paying, next nightly refresh shrinks the agent's score *and* their vouch term — Welile's exposure automatically de-risks.
- **Behavior-shaping.** Agents now have a concrete monetary reason (higher vouch, more lending pool from `LendingAgentPortal`) to chase late tenants — aligning with the Trust Mission constitution.
- **Backward-compatible.** Tier thresholds (≥80 excellent / ≥60 good / etc.) unchanged; existing UI continues to work — just with one extra breakdown row.

### Files to add / change
- `supabase/migrations/<new>.sql` — define `compute_agent_performance(uuid)` helper + replace `get_user_trust_profile` to (a) compute the new factor, (b) re-weight Network 25 → 15, (c) extend `breakdown`, `weights`, and add `agent_performance` block, (d) add `agent_term` to borrowing-limit GREATEST.
- `src/hooks/useTrustProfile.ts` — extend `TrustProfile` type with `breakdown.agent_performance`, `weights.agent_performance`, and a new `agent_performance` block (`qualifying_tenants`, `healthy_tenants`, `healthy_ratio`, `collection_rate`, `monthly_book`, `top_performing`).
- `src/components/ai-id/TrustScoreCard.tsx` — render the new row.
- `src/components/ai-id/TrustBoostSuggestions.tsx` — agent-specific nudge for low ratio.
- `src/components/ai-id/HolisticProfile.tsx` — "Top Performing Agent" badge + stat strip.
- `src/components/dashboards/AgentDashboard.tsx` — Tenant Health mini-card.
- `src/components/executive/ceo/TrustCoverageSection.tsx` — new KPI tile.

No edge-function changes, no new tables, no cron changes, no ledger changes. Existing nightly refresh propagates the new score to **every agent's AI ID** automatically on first run after deploy.

### Acceptance
- An agent with 10 tenants where 8 are paying ≥50% of `daily_repayment × 30` sees: trust breakdown row "Agent Performance ≈ 7.6 / 10", `borrowing_limit_ugx` increased by ≥40% of their healthy monthly book, "Top Performing Agent" badge on public AI ID.
- An agent with no qualifying tenants (<3 or all <30 days old) sees the row hidden and no change to their score.
- CEO Dashboard shows a network-wide "Agent Tenant Health" % within 24h of deploy (after nightly batch).

