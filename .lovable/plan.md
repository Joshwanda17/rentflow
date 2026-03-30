

# Fix Agent Tenant Filter Tabs — Rent Request Based

## Problem
The current filter tabs use tenant profile data (e.g. `verified`, `created_at`) instead of actual rent request statuses. The user wants filters tied to rent request lifecycle:

- **Owing** — tenants with outstanding balance on active requests (progress bar visible)
- **All** — all tenants who have received any rent request
- **Active** — tenants with approved/funded/disbursed requests
- **Cleared** — tenants whose rent requests are fully repaid (completed)
- **New** — tenants with pending (new) rent requests
- **No Phone** — unchanged

## Changes (`src/components/agent/AgentTenantsSheet.tsx`)

### 1. Expand rent request query
Currently fetches only `approved`, `disbursed`, `repaying` statuses. Expand to also include `pending`, `funded`, `completed` so we can categorize tenants properly.

### 2. Track per-tenant request statuses
Add a new state `tenantStatuses: Record<string, Set<string>>` that maps each tenant to the set of request statuses they have. Built during the same fetch loop that computes balances.

### 3. Update filter logic
```text
owing:   tenantBalances[id] > 0
all:     tenant has at least one rent request (any status)
active:  tenant has 'approved' | 'funded' | 'disbursed' | 'repaying' status
cleared: tenant has 'completed' status (or balance = 0 with active requests)
new:     tenant has 'pending' status
no-phone: unchanged
```

### 4. Update stats counts
Recalculate badge counts to match the new filter definitions using the `tenantStatuses` map.

## Files Changed
- `src/components/agent/AgentTenantsSheet.tsx`

