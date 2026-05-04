## Problem

Looking at the screenshot, tenant rent records that have only been **verified by Tenant Ops** are showing the badge **"completed"** in the agent's tenant balance list. That's wrong — `completed` in our schema means the rent cycle is **fully repaid**, not just approved.

In the current pipeline, Tenant Ops approving a request should move its status to `tenant_ops_approved`, then continue through Landlord Ops → COO → CFO → `funded` → `repaying` → `completed`. So no badge should ever read "Completed" simply because Tenant Ops verified.

## Root cause (suspected)

The list shown in the screenshot (the agent-side tenant list / balances view) renders the **raw `status` string** from `rent_requests` as a badge. Two separate things are conspiring:

1. The badge component shows whatever raw status the row has (`funded`, `completed`), so any rent request actually in `completed` state shows "completed" — fine on its own.
2. After the recent pipeline rewrite (Agent Ops → Tenant Ops → Landlord Ops → COO → CFO), some rent records appear to have been advanced to `funded`/`completed` via legacy paths or because of a verify action that wrongly fast-forwards status. We need to confirm whether the Tenant Ops "Approve" button is actually writing the correct `tenant_ops_approved` status (and not falling back to `completed`/`funded`).

The two `agent_allocate_tenant_payment` DB functions correctly only flip status to `completed` when `amount_repaid >= total_repayment`, so completion via repayment is sound. The bug is most likely in the **UI label**, not the DB.

## Fix

1. **Confirm the source list.** Identify which component renders the screen in the screenshot (most likely `AgentTenantsSheet` and/or `AgentTenantRentRequestsList`) and confirm it is rendering the raw `status` string as the badge text.
2. **Decouple "approval pipeline" from "rent cycle" labels.** Introduce one shared helper (e.g. `getRentRequestStatusLabel(status)`) that maps:
   - `pending`, `agent_ops_approved`, `tenant_ops_approved`, `landlord_ops_approved`, `coo_approved` → "In review" / "Approved" (in-pipeline labels, never "completed")
   - `funded` → "Funded"
   - `disbursed` / `repaying` → "Active"
   - `completed` → "Fully repaid" (only when `amount_repaid >= total_repayment`)
   - `rejected` → "Rejected"
3. **Apply the helper** in:
   - `src/components/agent/AgentTenantsSheet.tsx`
   - `src/components/agent/AgentTenantRentRequestsList.tsx`
   - `src/components/agent/AgentRentRequestsManager.tsx` (already has labels; align them)
   - any other badge that prints `req.status` directly (search and replace).
4. **Defensive guard.** Before showing "Fully repaid", also check `amount_repaid >= total_repayment` — so even if a row is mis-marked `completed` in the DB, the UI won't claim it's fully paid when it isn't.
5. **Audit** the recent migration (`20260504080457_…`) and the Tenant Ops approve handler in `RentPipelineQueue.tsx` to make sure the `tenant_ops_approved` write isn't being overridden anywhere; if it is, fix the offending update.

## Out of scope

- No change to the DB pipeline status names.
- No change to the rent repayment / completion logic.
- No backfill of historic `completed` rows — we only fix the label and the gating check.

## Acceptance

- After Tenant Ops verifies a rent request, in every agent-facing list the badge reads "Approved" (or "In review" for earlier stages), never "Completed".
- "Fully repaid" only ever appears for rows where `amount_repaid >= total_repayment`.
- Funded / Active / Rejected labels stay accurate.
