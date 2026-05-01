# Rejected rent requests on the agent dashboard

Today, when a request is rejected somewhere in the Tenant Ops → Agent Ops → Landlord Ops → COO → CFO chain, the agent who created it can see it in **My Rent Requests** but only as a generic red "Rejected" badge. The rejection reason and the reviewer who rejected it are invisible, and the agent has no way to act on it.

This plan brings rejected requests back to the agent with full context and two clear actions: **Edit & Resubmit** or **Delete**.

## What the agent will see

In `AgentMyRentRequestsSheet` (the "My Rent Requests" sheet opened from the agent wallet/dashboard):

1. A new **"Needs your attention"** section pinned to the top, listing every request with `status = 'rejected'` that the agent created (`agent_id = me`).
2. Each rejected card shows:
   - Tenant name, rent amount, landlord, created date
   - A bold red **Rejected at: <Stage>** chip (Tenant Ops / Agent Ops / Landlord Ops / COO / CFO), derived from `rejected_at_stage`
   - Rejecting officer's name + timestamp (resolved from the matching `*_reviewed_by` / `*_reviewed_at` columns for that stage)
   - A highlighted red banner: **"Reviewer comment"** with `rejected_reason` shown in full (no clamping)
   - If `reopen_count > 0`, a small "Reopened N times" note
3. Two action buttons on each card:
   - **Edit & Resubmit** (primary) — opens an edit drawer
   - **Delete** (destructive, with confirm dialog)

The existing approved/pending list stays as is, just below this new section.

## Edit & Resubmit flow

A new `AgentEditRentRequestDialog` opens with the existing request pre-filled. Agent can change:

- Rent amount, duration (days), number of payments
- Tenant water meter / electricity meter
- Property GPS (re-capture if needed)
- House photos (replace/add)
- Landlord contact / address corrections (only if landlord is unverified)

Submit calls a new RPC `agent_resubmit_rent_request(p_request_id, p_patch jsonb, p_agent_note text)` which:

- Validates the caller is the request's `agent_id`
- Validates current `status = 'rejected'`
- Applies the whitelisted column patch
- Recomputes `access_fee`, `total_repayment`, `daily_repayment` using the existing rent formula
- Resets `status` back to the stage that rejected it (mirrors the existing `reopen_rent_request` behaviour: pending → tenant_ops_approved → agent_verified → landlord_ops_approved → coo_approved)
- Increments `reopen_count`, sets `reopened_at = now()`, `reopened_by = auth.uid()`, `reopen_reason = p_agent_note`
- Clears `rejected_reason`, `rejected_at`, `rejected_at_stage`
- Regenerates the repayment schedule (deletes old `repayment_schedule` rows for the request, inserts new ones via the existing schedule generator pattern)
- Emits a `system_event` of type `rent_request.resubmitted_by_agent`
- Captures a trust signal via `capture_trust_signal` (per the Trust Mission core rule)

The 3-reopen cap from `RejectedRequestsQueue` is preserved: if `reopen_count >= 3`, the **Edit & Resubmit** button is disabled and the agent sees "Contact a manager to reopen further."

## Delete flow

Confirm dialog: "Delete this rejected request? This cannot be undone."

A new RPC `agent_delete_rejected_rent_request(p_request_id, p_reason)`:

- Validates caller is `agent_id`
- Validates `status = 'rejected'`
- Soft-deletes by setting `status = 'deleted_by_agent'` (avoids cascade pain on `repayment_schedule`, `general_ledger`, etc.; matches the project's preference for state transitions over hard deletes)
- Writes an `audit_logs` row (`action_type = 'rent_request_deleted_by_agent'`, `table_name = 'rent_requests'`, `record_id = p_request_id`, `reason = p_reason` — must be ≥10 chars per audit governance rule)
- Emits `system_event` `rent_request.deleted_by_agent`

`AgentMyRentRequestsSheet`'s query is updated to exclude `status = 'deleted_by_agent'`.

## RLS additions

Add a single update policy and a single delete-via-status policy so the new RPCs run as the calling agent:

- `Agents can resubmit own rejected requests` — UPDATE on `rent_requests`, USING/CHECK: `auth.uid() = agent_id AND status IN ('rejected', /* new staged status */)`
- The RPCs are `SECURITY DEFINER` with `SET search_path = public`, so the policy is mainly defence-in-depth.

## Files to add

- `src/components/agent/AgentRejectedRequestsSection.tsx` — new "Needs your attention" list block
- `src/components/agent/AgentEditRentRequestDialog.tsx` — edit & resubmit drawer (mobile sheet on small viewports, dialog on desktop)
- `src/hooks/useAgentRejectedRequests.ts` — react-query hook returning rejected rows + reviewer name lookup
- `supabase/migrations/<ts>_agent_rejected_rent_requests.sql` — adds the two RPCs, the RLS policy, and the `deleted_by_agent` status allowance

## Files to edit

- `src/components/agent/AgentMyRentRequestsSheet.tsx` — mount `<AgentRejectedRequestsSection />` above the existing list; exclude `deleted_by_agent` from the main query
- `src/components/wallet/AgentRentRequestsWalletSection.tsx` — add a small red badge "N rejected — needs review" linking to the sheet
- `src/lib/rentCalculations.ts` — export the recompute helper used by the resubmit RPC payload validation (already exists; no logic change, just confirming the contract)

## Diagram

```text
Rejected (any stage)
        |
        v
Agent dashboard ── "Needs your attention"
        |
   +----+----+
   |         |
 Edit &    Delete
 Resubmit  (soft, audited)
   |
   v
agent_resubmit_rent_request RPC
   |
   +-- patch row, recompute fees, regen schedule
   +-- status -> rejecting stage (reopen semantics)
   +-- reopen_count++, clear rejection fields
   +-- emit system_event + trust signal
```

## Out of scope

- Changing the multi-stage approval chain itself
- Touching the executive `RejectedRequestsQueue` (it keeps working with the same columns)
- Hard-deleting rejected rows (we soft-delete to preserve audit + ledger integrity)
