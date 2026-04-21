

## Filter Performance Report to Agents With Tenants Only

### Change
In `src/components/executive/AgentPerformanceReport.tsx`, tighten the row filter so only agents who actually have at least one assigned tenant appear.

### Current behavior
Rows are kept if `collected > 0 OR tenants_total > 0`. This lets in agents who have collections in the window but no tenants assigned in `rent_requests` (e.g. ad-hoc collectors, legacy data).

### New behavior
Keep a row only when `tenants_total > 0` (i.e. the agent has at least one tenant attributed via `rent_requests.agent_id`). Agents with zero tenants are excluded entirely — even if they have collections or interest in the window.

### Implementation (one-line change)
In the rows builder:
```ts
.filter(r => r.tenants_total > 0)   // was: r.collected > 0 || r.tenants_total > 0
```

### Side effects
- TOTALS row recomputes automatically from filtered rows (already derived via `rows.reduce`).
- PDF export uses the same filtered list, so it stays consistent with the on-screen table.
- Empty state ("No agent activity in this period") still renders when no agent has tenants in range.

### Verification
- Open Agent Ops → Performance Report → only agents with `rent_requests` rows appear.
- TOTALS reflect only those agents.
- Download PDF → same filtered set.

