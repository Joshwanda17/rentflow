## Goal

Tie how much rent an agent can post for a tenant to that tenant's actual repayment behavior, and cap each agent's total outstanding exposure across all their tenants at **UGX 100,000,000**.

## Limit model

### Per-tenant rent request limit (driven by repayment rate)

`repayment_rate` = `total_paid_on_time / total_due_to_date` over the tenant's completed + active rent cycles (last 180 days). New tenants with no history default to the "starter" tier.

| Tier | Repayment rate | Per-request max |
|------|---------------|-----------------|
| Starter (new tenant, no history) | — | UGX 500,000 |
| Building (≥ 60%) | 60–79% | UGX 1,500,000 |
| Reliable (≥ 80%) | 80–94% | UGX 3,000,000 |
| Premium (≥ 95%) | 95–100% | UGX 6,000,000 |
| Defaulting (< 60%) | below 60% | blocked (must clear arrears) |

A tenant with an active unpaid rent request cannot start a new one (existing rule, kept).

### Agent-level aggregate cap

Across all rent requests this agent has posted that are still in `outstanding_balance > 0`, the sum cannot exceed **UGX 100,000,000**. New requests are clipped to whichever is smaller:

```text
allowed = min(tenant_tier_max, 100_000_000 − agent_current_exposure)
```

If `allowed < 100,000` the agent is told to wait for collections to free up headroom.

## Implementation

### 1. New RPC `get_agent_rent_request_capacity(p_agent_id, p_tenant_id)`

Returns:
- `tenant_repayment_rate` (numeric 0–1)
- `tenant_tier` (text)
- `tenant_max` (bigint, UGX)
- `agent_exposure` (bigint, sum of outstanding across agent's active rent_requests)
- `agent_cap` (bigint, hard 100M)
- `agent_headroom` (bigint, `agent_cap − agent_exposure`)
- `allowed_max` (bigint, `min(tenant_max, agent_headroom)`)
- `reason` (text, human-readable if blocked)

Read-only, `SECURITY DEFINER`, `SET search_path = public`.

### 2. Server-side enforcement

Add a `BEFORE INSERT` trigger on `public.rent_requests` that:
- Calls `get_agent_rent_request_capacity(agent_id, tenant_id)`
- Rejects if `rent_amount > allowed_max` or `tier = 'defaulting'`
- Raises a clean exception message the dialog can surface

### 3. Frontend wiring (UI only — no business logic duplicated)

In `AgentRentRequestDialog.tsx`:
- On tenant select, fetch capacity via the new RPC
- Show a compact "Repayment Capacity" card: tier badge, repayment %, tenant max, agent headroom
- Clamp the rent amount input's `max` to `allowed_max`
- Inline error when amount > `allowed_max` (with the reason from RPC)
- Disable submit when blocked

### 4. Agent dashboard surface

Small "Tenant Rent Capacity" widget at the top of the agent's tenants list (uses the same RPC aggregated): shows used / 100M, headroom, and how many tenants are currently in each tier.

## Out of scope

- Changing existing rent_requests or recalculating limits on prior approvals
- Changing the Welile Trust Score formula (this is a separate, simpler operational guardrail)
- Refunds / clawbacks
