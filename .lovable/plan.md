

## Fix: Active Tab to Show All Tenants with Active Rent Requests

### Problem
The "Active" tab in the Agent's tenant list only shows tenants whose rent requests are in `approved`, `funded`, `disbursed`, or `repaying` status. It excludes tenants with `pending` or `agent_verified` requests — these are still active (in-progress) rent requests that the agent should see.

### Solution
Expand the `activeStatuses` set to include all non-terminal statuses. A rent request is "active" if it hasn't reached a final state (`completed`, `rejected`, `defaulted`).

### Changes — Single File

**`src/components/agent/AgentTenantsSheet.tsx`**

Update the `activeStatuses` set in two locations (filter logic ~line 217 and stats ~line 262):

```
// Before
const activeStatuses = new Set(['approved', 'funded', 'disbursed', 'repaying']);

// After
const activeStatuses = new Set(['pending', 'agent_verified', 'approved', 'funded', 'disbursed', 'repaying']);
```

This ensures any tenant with a rent request still in the pipeline appears under the "Active" tab, giving the agent full visibility of all in-progress tenants.

