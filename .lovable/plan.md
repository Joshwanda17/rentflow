# Group Review & Approval for Agent Advances

Give the Agent Ops manager a way to select multiple pending advance requests in the queue and act on them in one go — bulk approve (send to CFO), bulk reject, or bulk approve + disburse immediately (skip CFO), instead of opening each request one at a time.

## Where it lives

`src/components/ops/AdvanceRequestsQueue.tsx` — the existing "Agent Advance Requests" list on the Agent Ops dashboard (`/executive-hub?tab=agent-ops`). No new route or tab; the same queue gains a selection mode.

## User flow

1. Each request card gets a checkbox on the left. Tapping the card body still opens the existing per-request evaluation dialog (unchanged).
2. A "Select all" checkbox at the top toggles every currently-listed request.
3. When at least one request is selected, a sticky **Bulk action bar** appears at the bottom of the queue showing:
   - Count selected and combined UGX total.
   - Actions: **Approve & Send to CFO**, **Approve & Disburse Now**, **Reject**.
4. Each action opens a confirmation dialog listing every selected agent, name, and requested amount, plus:
   - A single shared **decision note / rejection reason** textbox (applied to all).
   - For "Disburse Now": the mandatory skip-CFO reason textbox (same rule as today's single-item flow).
   - For all: a warning summary if any selected request is over its suggested amount or over the agent's current limit — the row is highlighted in the list, and the operator has to tick "I've reviewed the flagged rows" before Confirm becomes enabled.
5. On confirm, requests are processed **sequentially** (not in parallel) so wallet ledger writes stay ordered. A progress toast shows "Processing 3 of 12…". At the end a summary toast reports `X succeeded, Y failed`, and the failed rows stay selected with their error message shown inline so the operator can retry or open them individually.

## Amounts

Group approvals use each request's **currently-edited amount** (from the per-row `amounts` state if the operator opened it, otherwise the original `principal`). There is no bulk amount editor — bulk is for "these look right as-is". Anyone needing to change an amount uses the existing single-request dialog first, then includes it in the selection.

## Permissions & safety

- Bulk actions are only visible to the same roles that already see `AdvanceRequestsQueue` (Agent Ops / super admin / CTO — unchanged, no RLS or role change).
- No new DB migration. Each item still goes through the existing single-item paths:
  - Approve → CFO: same `agent_advance_requests` update the current `approveMutation` performs.
  - Approve + Disburse: same `disburseAgentAdvanceRequest` helper in `src/lib/disburseAgentAdvance.ts` (which already handles the ledger, `agent_advances` row, and SMS).
  - Reject: same `status = 'rejected'` update.
- Idempotency is preserved because each disbursement is guarded by the existing `.in('status', ['pending', 'agent_ops_approved', 'cfo_approved'])` filter — a row that was already handled just fails cleanly and is reported in the failure list.

## Technical notes

- New local state in `AdvanceRequestsQueue`:
  - `selectedIds: Set<string>`
  - `bulkAction: 'approve_to_cfo' | 'approve_disburse' | 'reject' | null`
  - `bulkNotes: string`, `bulkSkipReason: string`, `bulkAckFlagged: boolean`
  - `bulkProgress: { done: number; total: number; failures: Array<{ id: string; agent: string; error: string }> } | null`
- New helpers extracted from the existing `approveMutation` so both single and bulk paths call the same functions:
  - `approveToCfo(req, note, amount)`
  - `rejectRequest(req, reason)`
  - `approveAndDisburse(req, note, skipReason, amount)` — thin wrapper over `disburseAgentAdvanceRequest`.
- Bulk runner is a plain `async` loop with `for … of` + try/catch per item; on completion it invalidates the same query keys the current mutation invalidates (`advance-requests-queue`, `advance-requests-reviewed`, `cfo-advance-requests`).
- Existing per-row checkbox import (`Checkbox` from `@/components/ui/checkbox`) is already in the file — no new UI dependencies.
- Card click currently opens the evaluation dialog; we'll stop click propagation on the checkbox so ticking it doesn't also open the dialog.

## Out of scope

- No bulk amount editing.
- No changes to the CFO-side queue (`CFOAdvanceRequestPayments.tsx`) — the CFO already reviews approved requests one-by-one; that stays as is unless you ask for it separately.
- No DB migrations, no new edge functions, no schema changes.
