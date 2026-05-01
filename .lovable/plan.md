## Problem

The agent dashboard's quick **Deposit** button opens `DepositFlow` with `defaultPurpose="operational_float"` and `lockPurpose`. There is a `BEFORE INSERT` Postgres trigger (`validate_operational_float_allocations`) that **rejects any deposit row whose `deposit_purpose = 'operational_float'` unless `notes` contains an `[ALLOCATIONS][...]` JSON breakdown summing to the deposit amount**. The quick deposit flow does not collect a tenant breakdown, so every submission dies with:

> Operational Float deposits require a per-tenant allocation breakdown

You said the deposit button should not obey that rule.

## Why the rule exists (and why we keep it for the right flow)

The allocation rule belongs to the [Agent Tenant Float Allocation](mem://features/agent-tenant-float-allocation) feature: when an agent collects a lump sum **on behalf of named tenants**, the deposit must split per tenant so each tenant's float is credited. That is genuinely needed in `CollectFromReferenceDialog` (the "Collect from reference" flow), which already builds the `[ALLOCATIONS]` payload.

It is **not** appropriate for the generic header "Deposit" button, which is just an agent topping up their own operational float wallet with no tenants attached.

## Fix (minimal, frontend-only)

Change the agent dashboard's quick-deposit invocation so it no longer pins the purpose to `operational_float`. Let the agent pick between Operational Float and Personal Deposit, defaulting to **Personal Deposit** (which is not gated by the trigger), and remove the lock so they can switch if they want.

In `src/components/dashboards/AgentDashboard.tsx` (around line 653):

```tsx
<DepositFlow
  open={showQuickDeposit}
  onOpenChange={setShowQuickDeposit}
  allowedPurposes={['personal_deposit', 'operational_float']}
  defaultPurpose="personal_deposit"
/>
```

Changes:
- `defaultPurpose` flips from `operational_float` → `personal_deposit`.
- `lockPurpose` is dropped, so the purpose grid stays visible and the agent can pick another purpose.
- Order in `allowedPurposes` is reordered so Personal Deposit appears first in the grid.

## What stays exactly the same

- `CollectFromReferenceDialog` still uses `operational_float` + builds the `[ALLOCATIONS]` payload — the per-tenant rule keeps protecting that flow.
- The DB trigger is **not** touched. Memory rule [Agent Tenant Float Allocation](mem://features/agent-tenant-float-allocation) remains valid: any deposit that is genuinely "lump sum for multiple tenants" must still carry the breakdown.
- The empty-string `deposit_purpose` guard from the previous fix stays in place.

## Files to change

- `src/components/dashboards/AgentDashboard.tsx` — 1 small JSX block (the `<DepositFlow>` for `showQuickDeposit`).

No DB migrations, no edge function changes, no other components touched.

## How to verify after the change

1. Tap the floating **Deposit** button on the agent dashboard.
2. The purpose grid shows **Personal Deposit** (selected) and **Operational Float**.
3. Submit with Personal Deposit → goes through (no allocation error).
4. If the agent picks Operational Float here, they will still get the allocation error — which is correct, because that purpose belongs to the "Collect from reference" flow that builds the breakdown.