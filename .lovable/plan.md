# Plan: Show Agents What They Owe Welile

## Goal
Give every agent a single, honest figure for **how much money Welile has paid out on behalf of their tenants** — and how much of that the company is still waiting to recover. No new tables, no schema changes, no writes; pure read + display.

## What "owed" means here
For an agent, the company's exposure to them is the sum across all of their tenants' rent cycles of:

```
owed_to_company = Σ (total_repayment − amount_repaid)   for active cycles
                + Σ accumulated_debt                    from subscription_charges (guarantor role)
                + advance_balance                        (already in wallet bucket)
```

Plus two contextual totals so the number is not scary in isolation:
- **Lifetime rent disbursed for my tenants** (what Welile has ever paid out for them)
- **Lifetime repaid** (what's come back, via tenants or via the agent)

All three numbers come from data the app already queries — no new schema.

## Data sources (all already in use)
1. `rent_requests` filtered by this agent (linking_agent / agent assignment), statuses `disbursed | repaying | completed | funded` — fields `rent_amount`, `total_repayment`, `amount_repaid`, `disbursed_at`. Pattern already used in `AgentTenantsSheet.tsx` and `AgentRequestPipelineView.tsx`.
2. `subscription_charges` where `agent_id = me` and `status = active` — `accumulated_debt` (already used in `AgentRiskExposureCard`).
3. `useAgentBalances()` — `advanceBalance` (already shown in `AgentFloatBalanceCard`).

No new RPC. No new edge function. No DB migration.

## UI changes
A single new card: **`AgentCompanyDebtCard.tsx`** under `src/components/agent/`.

Layout (mobile-first, fits the existing card grid):

```text
┌─ Owed to Welile ────────────────────────────┐
│  UGX 1,240,000          [What is this?]     │  ← headline, destructive when > 0
│  Outstanding company exposure on your book  │
│                                             │
│  Lifetime paid out for my tenants  4.20M    │
│  Lifetime repaid                   2.96M    │
│  Active cycles outstanding         1.18M    │
│  Subscription debt (guarantor)       40K    │
│  Personal advance (wallet)            20K   │
│                                             │
│  [ View tenant breakdown → ]                │  ← opens AgentTenantsSheet (already exists)
└─────────────────────────────────────────────┘
```

- Headline figure uses `formatUGX`, destructive color when > 0, muted when 0.
- "What is this?" tooltip explains: *"This is everything Welile has paid out for your tenants that hasn't been repaid yet. It is not a personal debt — it goes down every time a tenant repays."* This is important so agents don't panic.
- The breakdown link reuses `AgentTenantsSheet` (already mounted from the dashboard) so we don't build a second list.

## Hook
New hook `useAgentCompanyExposure.ts` (mirrors `AgentRiskExposureCard`'s pattern):
- Single `useQuery`, key `['agent-company-exposure', userId]`.
- Parallel fetch: `rent_requests` (3 status sets) + `subscription_charges` + reuse `useAgentBalances` for `advanceBalance`.
- Returns `{ outstandingCycles, lifetimeDisbursed, lifetimeRepaid, subscriptionDebt, advanceBalance, totalOwed }`.
- 30s `refetchInterval`, invalidated by the same realtime channels `useWalletRealtime` already taps.

## Where it mounts
`src/components/dashboards/AgentDashboard.tsx`, immediately **above** the existing `<AgentRiskExposureCard />` (line ~546), so the order on the home screen reads: Wallet → **Owed to Welile** → Risk Exposure → Tenants. This keeps the most actionable number near the top.

It also gets a compact echo inside `FullScreenWalletSheet` (under the Available Balance hero) so an agent who opens their wallet from anywhere sees the same total.

## Out of scope (not doing now)
- No new ledger writes, no new categories, no triggers.
- No `subscription_charges` schema additions.
- No changes to repayment math, commission, or float rules.
- No new approval flows.

## Verification before shipping
- Spot-check 3 known agents (one with zero tenants, one fully repaid, one with active cycles) by running the same SQL the hook will run and comparing to the card.
- Confirm the headline equals `outstandingCycles + subscriptionDebt + advanceBalance` exactly.
- Confirm card hides itself (returns `null`) when the agent has no tenants and no advance — same pattern as `AgentRiskExposureCard`.
