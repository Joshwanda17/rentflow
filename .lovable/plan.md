## Goal

Tenants registered with an existing outstanding balance (`registration_type = 'outstanding_balance'`) are already living in their property — there is nothing for Welile to disburse to a landlord and no fresh property/landlord to verify. They must skip Landlord Ops, COO, and CFO, and complete after **Tenant Ops + Agent verification only**.

Today, all rent requests are forced through the same 5-stage pipeline (Tenant Ops → Agent Ops → Landlord Ops → COO → CFO → Disbursed). 9 outstanding-balance requests are currently sitting at `pending`, 1 at `tenant_ops_approved`, and 1 stranded at `coo_approved` because the flow doesn't fit them.

## What changes

### 1. Backend — branch the pipeline by `registration_type`

Add a server-side rule (DB trigger on `rent_requests` UPDATE of `status`):

- If `registration_type = 'outstanding_balance'`:
  - `pending` → on Tenant Ops approve, advance to `tenant_ops_approved` (same as today, but skip the `assigned_agent_id` requirement; the original `agent_id` is the verifier).
  - `tenant_ops_approved` → on Agent verify, jump straight to **`completed`** (terminal). Stamp `agent_verified_*`, `landlord_ops_reviewed_*`, `coo_reviewed_*`, `cfo_reviewed_*` with the same agent + timestamp so audit history stays well-formed, and mark `disbursed_at = now()` with `payout_method = 'no_disbursement_outstanding'`.
  - Block any attempt to write `landlord_ops_approved`, `coo_approved`, `funded`, `disbursed` for these requests.
- No landlord verification bonus, no agent float credit, no CFO payout authorization for this branch (these are tied to disbursement, which never happens).
- Backfill: the 1 stranded `outstanding_balance / coo_approved` row gets moved to `completed` by the migration.

### 2. Pipeline tracker — show a 2-stage view

`src/components/executive/RentPipelineTracker.tsx`:

- Accept a new prop `registrationType?: string`.
- When `registrationType === 'outstanding_balance'`, render only:

  ```text
  Tenant Ops  →  Agent Verify  →  Recorded
  ```

  (no Landlord Ops, no COO, no CFO, no Disbursed). "Agent Earnings at Each Stage" collapses to a single line: "Outstanding balance recorded — no disbursement, no bonus".

### 3. Queue logic — surface and route correctly

`src/components/executive/RentPipelineQueue.tsx`:

- Fetch `registration_type`, `initial_outstanding_balance` alongside existing fields.
- In the Tenant Ops queue (`stage='pending'`), show an amber "Outstanding balance" badge on these rows and skip the agent-assignment requirement (the original agent is the verifier).
- In the Agent Ops queue (`stage='tenant_ops_approved'`), the approve action calls the new edge function path that closes the request to `completed` instead of advancing to `agent_verified`. Button label becomes "Confirm & Record Outstanding".
- In Landlord Ops, COO, CFO queues: filter these requests OUT (they never enter those queues anyway after the trigger fix).

### 4. Review dialog ("Review Rent Request" sheet — the screenshot)

Inside the same file, when the selected request has `registration_type = 'outstanding_balance'`:

- Hide the Property Location & LC1 card (no fresh property to verify).
- Hide the long agent earnings table (the one highlighted in yellow in the screenshot).
- Hide COO / CFO / Disbursed pills in the inline tracker.
- Replace the bonus block with a compact note: "No disbursement — recording outstanding balance of UGX X for an existing tenancy."

### 5. Tenant-facing display

In any place that shows the tracker on the tenant's side (search for `RentPipelineTracker` usages), pass through `registrationType` so the tenant sees the same short 2-step flow and isn't confused waiting for "CFO" steps that will never happen.

## Files touched

- `supabase/migrations/<new>.sql` — trigger `rent_requests_outstanding_pipeline_guard` + backfill of the stranded row.
- `src/components/executive/RentPipelineTracker.tsx` — new prop + branched rendering.
- `src/components/executive/RentPipelineQueue.tsx` — fetch flag, badge in list, branched approve action, hide Property/LC1 + bonus blocks in the review sheet.
- Tracker call sites that should pass `registrationType` (tenant dashboards, agent pipeline hub).

## Out of scope

- No change to the normal `registration_type='normal'` 5-stage flow.
- No change to the bonus/commission engine for normal requests.
- No new role; both approvals (Tenant Ops, Agent) already exist.
