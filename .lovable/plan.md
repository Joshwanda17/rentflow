# Reopen Rejected Rent Requests

Today the rent pipeline has 40 `rejected` requests with no path back into the workflow. Once a Tenant-Ops, Agent, Landlord-Ops, COO, or CFO reviewer marks a request as rejected, it disappears from every queue and there is no UI to reconsider it — even if the rejection was wrong, the tenant fixed the issue, or new evidence arrived. This adds a controlled "reopen" path.

## How it works

A new **Rejected Requests** tab is added to every existing pipeline tab (Tenant Ops, Agent Ops, Landlord Ops, COO, CFO). Each rejected row shows: who rejected, when, the reason, the tenant, and the rejection stage. Two actions:

- **Reopen** — sends the request back to the stage at which it was rejected (e.g. a request rejected by Tenant Ops returns to `pending` so Tenant Ops re-reviews it; one rejected by COO returns to `landlord_ops_approved`). Requires a 10-character reopen reason. Logged in `audit_logs`.
- **Approve directly** — only available to **manager** and **cfo** roles. Skips re-walking the chain and forwards the request straight to the next stage after where it was rejected (or to `funded` for CFO). Requires a 10-character override reason and the standard payout TID if it lands at the CFO step. Also logged.

Reopened requests appear in the normal stage queue exactly like any other pending item, with a small "Reopened" badge and a tooltip showing the prior rejection reason. The reopen counter prevents endless ping-pong: after **3 reopens** the row is locked and only a manager can act on it.

## Database changes

- `rent_requests`: add `rejected_at timestamptz`, `rejected_at_stage text` (snapshot of the stage when rejected), `reopened_at timestamptz`, `reopened_by uuid`, `reopen_count int default 0`, `reopen_reason text`.
- Backfill `rejected_at_stage` for the 40 existing rejected rows by deriving from the existing reviewer columns (CFO=1, COO=6, LandlordOps=6, AgentOps=5, TenantOps=16, Unknown=12 — the Unknown set goes back to `pending`).
- New SECURITY DEFINER RPCs (CFO/Manager/COO/role-scoped via `has_role`):
  - `reopen_rent_request(p_request_id uuid, p_reason text)` — resets status to the original rejection stage, increments counter, writes audit log, emits `system_event` `rent_request.reopened`.
  - `force_approve_rejected_rent_request(p_request_id uuid, p_reason text, p_payout_ref text default null)` — manager/CFO only; advances status to `nextStatus` for the rejected-at-stage; emits `rent_request.force_approved`.

## UI changes

- New `RejectedRequestsQueue` component — same row layout as `RentPipelineQueue`, filter `status='rejected'`. Two action buttons per row, dialog with reason textarea + (when force-approving from CFO stage) TID field.
- `AgentOpsPipelineHub`, `LandlordOpsDashboard`, `pages/coo/Dashboard`, `pages/cfo/Dashboard` each get a new **"Rejected"** tab/section that mounts `RejectedRequestsQueue` filtered to rows whose `rejected_at_stage` belongs to that role.
- Reopened-row badge added to `RentPipelineQueue` row renderer (small amber "Reopened ×N" pill with hover tooltip showing the prior `rejected_reason`).

## Files touched

- `supabase/migrations/<ts>_rent_request_reopen.sql` — schema + backfill + 2 RPCs
- `src/components/executive/RejectedRequestsQueue.tsx` (new)
- `src/components/executive/RentPipelineQueue.tsx` — render reopened badge
- `src/components/executive/AgentOpsPipelineHub.tsx`, `LandlordOpsDashboard.tsx` — add Rejected tab
- `src/pages/coo/Dashboard.tsx`, `src/pages/cfo/Dashboard.tsx` — add Rejected tab/section
- Memory: new entry `mem://features/rent/reopen-rejected-requests`

## Out of scope

- No automatic reopens. Every reopen is an explicit click.
- No change to the rejection action itself. The existing `handleReject` paths only get an extra two columns (`rejected_at`, `rejected_at_stage`) populated — which I'll add to all 5 rejection sites in one pass.
- No tenant-facing notification on reopen (suppressed per Database Write Suppression policy). The reopened request will simply re-enter the pipeline; existing event-driven listeners pick it up.

## One question before I implement

Should **force-approve** be available to:
1. **Manager + CFO only** (recommended; safest)
2. **Manager + CFO + COO**
3. **Anyone who can reopen** (most permissive — Tenant Ops could push their own rejected row through)

Default if you don't answer: option 1.