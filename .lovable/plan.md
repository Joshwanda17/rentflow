

## Why the Collected column is empty

The report's data is being **blocked by Row-Level Security (RLS)**, not by missing data. The database actually has **UGX 1,395,160** in `agent_collections` and **UGX 1,541,160** in `repayments` for Apr 16–22, but the executive viewing the report cannot read those rows.

### Root causes (3 distinct bugs)

1. **`agent_collections` RLS is agent-only.**  
   Policy: `agent_id = auth.uid()`. Executives, COO, CFO, financial-ops — none can read collections. Only the collecting agent can see their own rows. Result: 0 rows reach the report.

2. **`repayments` RLS is manager-only AND the query references a non-existent column.**  
   - Policy allows `tenant_id = auth.uid()` OR `has_role('manager')`. Executives without the `manager` role get 0 rows.  
   - The query selects `agent_id` and filters `.not('agent_id','is',null)`, but `repayments` has no `agent_id` column. PostgREST returns 400, `fetchAll` swallows the error and returns `[]`.

3. **`tenant_merchant_payments`** has 0 rows in this window — not a bug, just no data.

The agent list still renders (names, "Tenants Paid 0/35", daily portfolio) because that comes from `rent_requests`, which is readable. Only the money columns go blank.

### Fix plan

**A. Add executive-readable RLS for collections & repayments**

New SELECT policies (additive — agent/tenant policies stay):

```sql
-- agent_collections: let staff with reporting roles read all rows
CREATE POLICY "Staff can view all agent_collections"
  ON public.agent_collections FOR SELECT
  USING (
    has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'cfo')
    OR has_role(auth.uid(), 'coo')
    OR has_role(auth.uid(), 'financial_ops')
    OR has_role(auth.uid(), 'tenant_ops')
  );

-- repayments: same staff list (manager already has access)
CREATE POLICY "Staff can view all repayments"
  ON public.repayments FOR SELECT
  USING (
    has_role(auth.uid(), 'cfo')
    OR has_role(auth.uid(), 'coo')
    OR has_role(auth.uid(), 'financial_ops')
    OR has_role(auth.uid(), 'tenant_ops')
  );
```

(Confirm exact role enum values from `app_role` before running — fall back to whichever roles the COO / Tenant Ops dashboards already use.)

**B. Fix the broken `repayments` query in `AgentPerformanceReport.tsx`**

`repayments` has only `id, tenant_id, rent_request_id, amount, created_at` — no `agent_id`. Resolve agent via `rent_request_id → rent_requests.agent_id` (we already pull `rentReqsAll`, so build a `rentRequestId → agent_id` map and attribute repayments through it, the same pattern already used for merchant payments).

**C. Make `fetchAll` fail loudly**

Currently any PostgREST error returns `[]` silently. Surface errors so future column/RLS regressions trigger a visible toast instead of a blank column.

**D. Verification**

After the migration + code fix, reload the report for Apr 16–22 and confirm:
- Collected totals ≥ UGX 2.9M across the listed agents
- "Tenants Paid X/Y" shows non-zero numerators
- Commission and Total Wallet populate

### Files to change

- **New migration**: add SELECT policies to `agent_collections` and `repayments` for executive/ops roles.
- `src/components/executive/AgentPerformanceReport.tsx`:
  - Remove `agent_id` from `repayments` select; resolve agent via `rent_request_id` map.
  - Make `fetchAll` throw on error and surface via `toast.error`.

