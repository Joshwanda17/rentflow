

## Plan: Add Growth Metrics Section to CEO Dashboard

Add a new metrics section between the existing KPI cards and Charts, displaying the 5 metrics from the reference image: Active Users, New Users Today, Retention, Referrals, and Daily Transactions. All data sourced from existing tables.

### Data Sources

| Metric | Query |
|--------|-------|
| **Active Users** | `profiles` where `last_login` within 30 days (or total if no login tracking) |
| **New Users Today** | `profiles` count where `created_at >= startOfDay(now)` |
| **Retention** | Computed: (users with `last_login` in last 30d) / total users × 100 |
| **Referrals** | Ratio: referral count from `profiles.referred_by` / total users |
| **Daily Transactions** | `general_ledger` sum of `amount` where `transaction_date >= startOfDay(now)` |

### UI

A new styled card section titled **"Growth Metrics"** rendered as a horizontal row of 5 compact metric tiles between the KPI grid and the charts. Uses the same `rounded-2xl border bg-card` styling. Each tile shows the metric label and value, matching the reference table layout.

### Implementation

1. Add a single new `useQuery` hook (`exec-ceo-growth-metrics`) that fetches all 5 values in parallel via `Promise.all`.
2. Render a new section with 5 tiles in a `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` layout.
3. No existing KPI cards, charts, or table are modified.

### Files Changed

- `src/components/executive/CEODashboard.tsx` — add query + new section

