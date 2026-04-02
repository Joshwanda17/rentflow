

# Agent Commission Detail Breakdown

## Problem
The current agent earnings list shows only the earning type, a generic description, and the amount. Agents cannot see **who** the commission came from, **what role** they played, or **what percentage** they earned.

## Approach
Enhance the existing earnings history on `/agent-earnings` to show rich detail by joining `agent_earnings` with `commission_accrual_ledger` and resolving tenant/source names from `profiles`.

## Changes

### 1. Update `useAgentEarnings` hook
- Join `source_user_id` to `profiles(full_name)` in the earnings query so each earning shows who triggered it
- Also fetch the agent's `commission_accrual_ledger` entries (status: earned/approved/paid) to get `commission_role`, `event_type`, `percentage`, `repayment_amount`, and `tenant_id` with tenant name
- Expose a new `detailedEarnings` array that merges ledger context into each earning record (matched by `source_id` or `rent_request_id` + timestamp proximity)

### 2. Update `AgentEarnings.tsx` — Earnings History cards
- Expand each earning card to show:
  - **Tenant name** — who the repayment/event was for (from ledger join or source profile)
  - **Your role** — "Source Agent (2%)" or "Tenant Manager (8%)" or "Recruiter Override (2%)" based on `commission_role`
  - **Calculation** — e.g. "8% of UGX 125,000 repayment = UGX 10,000" using `percentage` and `repayment_amount`
  - For bonuses: show the triggering event clearly (e.g. "Tenant registration: John Doe")
- Add a tap-to-expand interaction on each card to keep the list clean but allow drill-down
- Keep the existing date grouping and tabs structure

### 3. RLS consideration
- `commission_accrual_ledger` needs an RLS policy allowing agents to SELECT their own rows (`.eq('agent_id', user.id)`)
- Add migration: `CREATE POLICY "Agents can view own commissions" ON commission_accrual_ledger FOR SELECT TO authenticated USING (agent_id = auth.uid())`

## Files Modified
- DB migration: RLS policy on `commission_accrual_ledger` for agent self-read
- `src/hooks/useAgentEarnings.ts` — fetch ledger detail + source profiles
- `src/pages/AgentEarnings.tsx` — expandable detail cards showing role, tenant, calculation

