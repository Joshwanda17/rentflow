

# Plan: Restore Capital Opportunity Card on Supporter Dashboard

## What
Re-add the `OpportunitySummaryCard` component to the Supporter Dashboard. This card (showing Total Rent Demand, Active Requests, Verified Landlords, Field Agents, returns info, and the "Deploy Capital" CTA) was previously removed in favor of `FundingPoolCard`. Both serve different purposes, so we restore the Opportunity card above the Funding Pool card.

## Changes

### 1. Edit `src/components/dashboards/SupporterDashboard.tsx`
- Add import for `OpportunitySummaryCard` from `@/components/supporter/OpportunitySummaryCard`
- Insert `<OpportunitySummaryCard />` in the opportunities section, just before `<FundingPoolCard />` (around line 416)

This is a single-import, single-render restoration — no new files or logic changes needed. The component already fetches its own data from `opportunity_summaries` via the `useOpportunitySummary` hook.

