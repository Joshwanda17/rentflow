# Add a "Repay Advance" button to the CFO Advances Overview

## What changes

Next to "Issue Advance" on the Advances overview header, a second button "Repay Advance" is added. It opens a two-step dialog:

1. **Pick the agent** — search by agent name or phone; the list shows only agents with an advance that still has an outstanding balance, with their outstanding amount and status.
2. **Enter the repayment** — amount (with Full / Half shortcuts, capped at outstanding), payment method (Mobile Money / Bank Transfer / Cash / Wallet Offset / Other), reference, and optional notes. On submit the payment posts and the overview refreshes.

Because the Advances overview is shared, this button appears for both the CFO dashboard and the Agent Ops Manager dashboard, matching the existing "Issue Advance" behaviour.

## Technical notes

- New file `src/components/advances/StaffRepayAdvanceDialog.tsx`: self-contained flow that queries `agent_advances` (`*, profiles!agent_advances_agent_id_fkey(full_name, phone)`), filters to `status <> 'completed'` and `outstanding_balance > 0`, and composes the two existing dialogs' UI patterns (search list from `AdvancePaymentSearchDialog`, amount form from `RecordAdvancePaymentDialog`).
- Submission reuses the existing `cfo-record-advance-payment` edge function with `{ advance_id, amount, payment_method, reference, notes }`. No new backend, RPC, migration, or edge function.
- `src/components/advances/AdvancesAnalyticsView.tsx`: add the `Repay Advance` button (outline variant, `HandCoins` icon) beside `Issue Advance`, wire its `open` state, and bump the existing `refreshKey` on success so the stats, analytics and outstanding panels refetch.
- Amounts use `formatUGX`; no changes to issuing, deduction schedules, or ledger logic.