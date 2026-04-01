

# Merge Angel Pool Module into Funder (Supporter) Dashboard

## What We're Building

Replace the current static `OpportunitySummaryCard` in the Supporter Dashboard's "Capital Opportunities" section with the full `CapitalOpportunityEntry` component — adapted to be **data-driven** and **event-driven**, showing different states based on the user's actual portfolio data.

## Logic Flow

```text
┌─────────────────────────────────────────────┐
│  Fetch investor_portfolios for current user │
└──────────────────┬──────────────────────────┘
                   │
        portfolios.length >= 1?
          ╱              ╲
        YES               NO
         │                 │
  Show COMMITTED view    Show DEFAULT
  (Tabbed: Tenant +      gateway card
   Angel Pool)           "Put Your Capital
   Tenant = default       to Work"
   tab (active badge)      │
         │              Click CTA →
         │              Selection Sheet →
         │              Investing tabs
         │
  "Support More" or
  "Invest More" →
  re-opens investing
  tab view
```

## Steps

### 1. Create `useCapitalOpportunities` hook
**New file**: `src/hooks/useCapitalOpportunities.ts`

- Fetches `investor_portfolios` for the current user (by `investor_id` and `agent_id`, deduped — same pattern as `SupporterDashboard.fetchTotalContributed`)
- Fetches `opportunity_summaries` (latest, same as `useOpportunitySummary`)
- Returns: `{ portfolios, totalInvested, portfolioCount, opportunitySummary, loading }`
- Listens to `supporter-contribution-changed` window event for refresh
- No realtime subscription (follows platform's realtime kill-switch policy)

### 2. Create `FunderCapitalOpportunities` component
**New file**: `src/components/supporter/FunderCapitalOpportunities.tsx`

Adapts the `CapitalOpportunityEntry` logic but with real data:

- **State machine**: `default | investing | committed`
- **Initial state decision**: If `portfolioCount >= 1` → start in `committed` state with Tenant Support as default tab. Else → `default` (gateway card).
- **Committed view**: Two-tab layout (pills, purple active):
  - **Tab 1 — Tenant Support** (default, marked ACTIVE): Uses real `opportunitySummary` data for stats (active requests, verified landlords, field agents, total rent demand). CTAs: "Support Tenant" → opens `FundRentDialog`, "Withdraw Capital" → opens `InvestmentWithdrawButton`.
  - **Tab 2 — Angel Pool**: Shows angel pool summary with calculation logic from constants. Since angel pool portfolios don't exist in DB yet, this tab shows the investing input form directly (amount entry + preview + "Invest in Angel Pool" button). Uses the corrected formulas:
    - `PRICE_PER_SHARE = TOTAL_POOL_VALUE / TOTAL_SHARES` (currently static from constants, will become dynamic when CFO sets it)
    - `shares = floor(amount / PRICE_PER_SHARE)`
    - `pool_ownership = (shares / TOTAL_SHARES) * 100`
    - `company_ownership = (shares / TOTAL_SHARES) * POOL_PERCENT`
    - Future value: `(company_ownership / 100) * valuation_usd * UGX_PER_USD`
- **Default view**: Gateway card ("Put Your Capital to Work") with real `total_rent_requested` from opportunity summary as the highlight metric. CTA opens selection sheet.
- **Investing view**: Same tabbed input form (Tenant Support + Angel Pool), with amount input, real-time preview, and invest buttons.

### 3. Update `SupporterDashboard.tsx`
- Replace `<OpportunitySummaryCard />` with `<FunderCapitalOpportunities />`
- Remove the `OpportunitySummaryCard` import
- The existing `FundRentDialog` and `InvestmentWithdrawButton` will be used inside the new component
- Keep existing agreement lock overlay logic around the new component

### 4. Angel Pool Calculation Constants
Keep using existing `src/components/angel-pool/constants.ts` — import `TOTAL_SHARES`, `PRICE_PER_SHARE`, `POOL_PERCENT`, `VALUATIONS`, `UGX_PER_USD` directly. The `PRICE_PER_SHARE` is currently `TOTAL_POOL_UGX / TOTAL_SHARES = 20,000` which matches the spec. When the CFO-managed dynamic value is added later, only the constants file changes.

### 5. Event-driven architecture
- Component dispatches `supporter-contribution-changed` after successful angel pool mock investment (tenant support already does this via `FundRentDialog`)
- `SupporterDashboard` already listens to this event and refreshes wallet + contributions
- No new events needed — hooks into existing event bus

## Files Changed
| File | Action |
|------|--------|
| `src/hooks/useCapitalOpportunities.ts` | Create |
| `src/components/supporter/FunderCapitalOpportunities.tsx` | Create |
| `src/components/dashboards/SupporterDashboard.tsx` | Edit (swap OpportunitySummaryCard → FunderCapitalOpportunities) |

## Technical Details
- All data fetching is async via Supabase client
- Portfolio check uses same deduplication pattern (investor_id + agent_id) already in the dashboard
- Angel pool investment is mock (toast + state reset) until the angel pool ledger integration is built
- Tenant support uses the existing real `FundRentDialog` flow
- No new DB tables or migrations needed
- No edge functions needed
- Constraints enforced: `shares` must be integer, `amount ≤ walletBalance`, `amount ≥ PRICE_PER_SHARE`

