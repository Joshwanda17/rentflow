# Agent-Controlled Daily Target

## Problem

`v_agent_daily_eligibility` counts **every** rent_request in statuses `pending → repaying` toward `expected_daily`, even when:

- The tenant has fully repaid (`amount_repaid >= total_repayment`) but the row was never closed.
- The tenant has effectively stopped paying / moved out, but the agent has no way to tell the system.

Result: `expected_daily` is inflated → `effective_pct` collapses → agents like Onesmus / Benjamin sit at "Bad/Blocked" even when they collected everything that's actually collectable.

Agents need a per-tenant switch: **"This tenant is paying"** vs **"This tenant is not paying"**, and the daily-target math must respect it. The system should also auto-drop fully-repaid rents.

## What we'll build

### 1. Per-rent payment status (set by the agent)

New column on `rent_requests`:

- `agent_payment_status` enum: `paying` (default) · `not_paying` · `completed_auto`
- `agent_payment_status_reason` text (≥10 chars, mandatory when set to `not_paying`, per Audit Governance)
- `agent_payment_status_set_at`, `agent_payment_status_set_by`

Only the rent's `agent_id` (or manager/operations) can update these fields (RLS + RPC `agent_set_rent_payment_status(rent_request_id, status, reason)`). Every change writes to `audit_logs` and emits a `system_event` `agent.rent.payment_status_changed` (per Trust Mission).

### 2. Eligibility view respects the flag

Update `v_agent_daily_eligibility` `eligible_rents` CTE to additionally exclude:

- `agent_payment_status = 'not_paying'`
- rows where `COALESCE(total_repayment,0) - COALESCE(amount_repaid,0) <= 0` (fully repaid → auto-drop, regardless of status)

`expected_daily`, `today_pct`, `yesterday_pct`, `effective_pct` and the BEFORE-INSERT trigger automatically use the corrected denominator — no changes needed to `enforce_agent_daily_eligibility` or to `useAgentCapacityMap` / `AgentRentCapacitySelfCard`.

### 3. Optional nightly auto-completion (housekeeping)

Cron `auto-close-fully-repaid-rents` (daily 02:00 Kampala): sets `status = 'completed'` on rent_requests where `amount_repaid >= total_repayment` and current status ∈ active set. Fixes the historical backlog that is silently inflating today's targets.

### 4. Agent UI — the "Paying / Not paying" switch

- **`PriorityCollectionQueue`** row: small status pill ("Paying" / "Not paying") + tap-to-toggle. Toggle opens a sheet that requires:
  - Status: Not paying / Paying
  - Reason (10-char min, dropdown: `moved_out`, `refused_to_pay`, `dispute`, `lost_job`, `unreachable`, `other` + free text)
  - Confirms via `agent_set_rent_payment_status` RPC
- **`AgentTenantsSheet`** and **`TenantProfileView`**: same pill + edit action, plus a short audit list ("Marked not paying — 2026-05-26 — moved_out").
- **`AgentRentCapacitySelfCard`**: explainer line under the daily target — "Excludes N tenant(s) you marked Not Paying and M auto-completed."
- **`DailyRentExpectedCard`** / `TodayCollectionsCard`: same denominator (already reads from the RPC, so nothing to wire — it just goes down).

### 5. Manager visibility

Executive `AgentCapacityBadge` / Agent Ops hub gets a column "Excluded rents" so managers can see who is parking tenants as Not Paying. A spike triggers review (no auto-block — agents control their own list, managers audit).

## Out of scope

- Reactivating a `not_paying` tenant via tenant deposit: if `agent_collections` posts a positive amount for that rent_request, a trigger flips status back to `paying` and writes the audit row. (Included — small trigger, prevents drift.)
- No changes to `rent_requests` lifecycle / disbursement flow.
- No changes to the 20% threshold or the 5-tier classifier.

## Technical details

**Migration**

```sql
ALTER TABLE public.rent_requests
  ADD COLUMN agent_payment_status text NOT NULL DEFAULT 'paying'
    CHECK (agent_payment_status IN ('paying','not_paying','completed_auto')),
  ADD COLUMN agent_payment_status_reason text,
  ADD COLUMN agent_payment_status_set_at timestamptz,
  ADD COLUMN agent_payment_status_set_by uuid REFERENCES auth.users(id);

CREATE INDEX idx_rr_agent_payment_status
  ON public.rent_requests(agent_id, agent_payment_status);
```

**View change** — replace `eligible_rents` CTE:

```sql
eligible_rents AS (
  SELECT ar.*
  FROM active_rents ar
  LEFT JOIN reversed rv ON rv.rent_request_id = ar.rent_request_id
  WHERE (rv.rent_request_id IS NULL OR COALESCE(ar.amount_repaid,0) > 0)
    AND ar.agent_payment_status = 'paying'
    AND COALESCE(ar.total_repayment,0) - COALESCE(ar.amount_repaid,0) > 0
)
```

(Pull `agent_payment_status`, `total_repayment` into `active_rents`.)

**RPC** `agent_set_rent_payment_status(p_rr_id uuid, p_status text, p_reason text)`:

- SECURITY DEFINER, `SET search_path = public`.
- Asserts caller is the rent's `agent_id` OR has role `manager` / `operations` / `coo` / `super_admin`.
- Requires `length(p_reason) >= 10` when `p_status = 'not_paying'`.
- Writes `rent_requests`, `audit_logs` (`action_type='rent.payment_status_changed'`), inserts `system_events`, and calls `capture_trust_signal` for the agent (factor: behavior).

**Reactivation trigger** on `agent_collections` AFTER INSERT: if the target rent_request is `not_paying` and `amount > 0`, set back to `paying` + audit.

**Frontend**

- New hook `useRentPaymentStatusMutation` wrapping the RPC + React Query invalidation of `['agent-daily-eligibility', agentId]`, `['priority-collection-queue']`, `['agent-tenants']`.
- New shared `<RentPaymentStatusPill rentRequest=... editable />` component used in `PriorityCollectionQueue`, `AgentTenantsSheet`, `TenantProfileView`.
- New `<MarkNotPayingSheet />` (reason dropdown + 10-char enforced textarea + Confirm).

**No frontend math changes** — denominator drops automatically because everything reads from `get_agent_daily_eligibility`.

## Verification

1. SQL: for an agent with a fully-repaid `repaying` row, `expected_daily` drops by that row's `daily_repayment`.
2. RPC: agent A cannot flip agent B's rent (RLS denies).
3. UI: marking a tenant Not Paying in `PriorityCollectionQueue` updates the daily target chip on `AgentRentCapacitySelfCard` within the realtime refresh window.
4. Audit: `audit_logs` shows a row with the reason; `system_events` has `agent.rent.payment_status_changed`.
5. Reactivation: collecting from a Not-Paying tenant flips status back and re-includes it in expected_daily next refresh.
