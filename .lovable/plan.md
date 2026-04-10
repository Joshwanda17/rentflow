

# Show All Agent Tenants in Priority Collections

## Problem

The Priority Collections queue is missing tenants for two reasons:

1. **Status filter too narrow**: The query only matches `['approved', 'disbursed', 'active', 'funded', 'repaying']`, but real data has statuses like `landlord_ops_approved`, `coo_approved`, `agent_verified`, `pending` — these tenants are excluded entirely.

2. **Outstanding filter removes paid-up tenants**: `.filter(i => i.outstanding > 0)` hides tenants who have fully repaid. The agent should still see them (marked as complete).

## Fix

**File**: `src/components/agent/PriorityCollectionQueue.tsx`

1. **Broaden the status filter** — query all rent requests for the agent *except* `rejected`, so every tenant in any active pipeline stage appears.

2. **Remove the `outstanding > 0` filter** — show all tenants. Those with zero outstanding get a "Completed" badge and sort to the bottom.

3. **Add a risk level for completed** — tenants with `outstanding === 0` get a `completed` risk level with a green style, sorted last.

4. **Group visually** — overdue/critical tenants remain at top (sorted by priority score), completed tenants appear at the bottom with a subtle separator.

This ensures the agent sees every single tenant assigned to them, with actionable priority ordering.

