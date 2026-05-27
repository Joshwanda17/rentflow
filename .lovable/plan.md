# Auto-route partner withdrawals through the linked proxy agent

## Goal

When a partner (supporter) withdrawal is approved from **any** of the three approval pages, automatically debit the partner's linked active proxy agent's wallet instead of the partner's wallet — even when the original `withdrawal_requests` row was not flagged as a proxy payout. Use the matched payout-email TID (when one exists) as the funding reference for audit traceability.

## Why server-side only

`approve-withdrawal` is the single edge function invoked by **CFOWithdrawalApprovals**, **COOPartnerWithdrawalApprovals** and **FinOpsWithdrawalVerification**. Making the change in one place covers all three pages without touching the UI, and keeps wallet mutations behind the existing CFO-governed pipeline (no new direct-debit channels — respects the WALLET SOLE WRITER rule and CFO Direct Debit policy).

## Server-side change (`supabase/functions/approve-withdrawal/index.ts`)

Right after the existing `managedProxyAgentId` resolution (~line 301), add a **partner→proxy fallback resolver** that runs whenever the requester is a partner/supporter and the request is NOT already tagged as a proxy payout:

1. Detect "is partner withdrawal":
   - `wr.user_id` has the `partner` or `supporter` role (check `user_roles`), AND
   - no `proxy_partner_id` / `agent_id` is present on the request.
2. Look up the **active, approved** proxy assignment for that partner:
   ```sql
   select agent_id from proxy_agent_assignments
   where beneficiary_id = wr.user_id
     and is_active = true
     and approval_status = 'approved'
   order by is_managed_account desc, created_at desc
   limit 1
   ```
3. If an assignment exists:
   - Promote the request to a proxy payout: set `proxyPartnerId = wr.user_id`, `fundingUserId = assignment.agent_id`, `isProxyPayout = true`, and reuse the existing proxy-payout debit pipeline (no new code paths).
   - The existing `partnerLinkedFloatAvailable` and ledger-checked gating already protect against over-debit.
4. If no active assignment exists, fall through to the current standard path (debit partner wallet) — no behavior change for partners without a proxy.

### Email TID enrichment (the "matching emails details" piece)

Before posting the ledger entries, run a one-shot lookup against `gmail_transactions`:
- Match by `transaction_id` = withdrawal TID (if present on the request), OR
- Match by `from_name`/`counterparty` phone + `amount` within ±1 UGX on outgoing rows from the last 7 days.

Stamp the match (when found) onto the ledger leg's `metadata` as:
```json
{
  "auto_routed_via_proxy": true,
  "partner_id": "<wr.user_id>",
  "proxy_agent_id": "<agent>",
  "gmail_message_id": "...",
  "gmail_transaction_id": "...",
  "email_tid": "..."
}
```
And on `withdrawal_requests.fin_ops_reference` if it's blank, write the email TID. This preserves the audit trail that ties the wallet debit back to the actual telecom email — what the user called "matching email details."

### Audit log

Append one `audit_logs` row per auto-routed approval:
- `action_type = 'withdrawal_auto_routed_to_proxy'`
- `table_name = 'withdrawal_requests'`
- `record_id = withdrawal_id`
- `reason` = `'Auto-routed partner withdrawal to active proxy agent (TID: <email-tid-or-none>)'` (≥10 chars, satisfies audit governance rule).

## Surfaces unchanged

No UI changes are required for the three approval pages. They continue to call `approve-withdrawal` exactly as today; the routing decision is invisible to the operator until they see the resulting ledger and wallet state.

## Out of scope

- Changing how funds are originally credited to partners vs proxies (already governed by Managed-Proxy Payout Routing).
- Modifying `cfo-direct-credit` or `wallet-deduction` (retired) paths.
- Adding an operator override toggle — answers indicate "fully automatic."

## Risks & mitigations

- **Over-debiting an agent** with insufficient cache: the existing `partnerLinkedFloatAvailable` + ledger-checked spendable gate already blocks the approval with a clear UGX shortfall error.
- **Partner with multiple proxies**: prefer `is_managed_account = true`, then most recently created — single deterministic pick.
- **Pre-tagged proxy payouts**: the new resolver runs only when `proxy_partner_id` / `agent_id` are absent, so no double-resolution.
- **Email match miss**: routing still proceeds; only the `metadata.email_tid` / `fin_ops_reference` enrichment is skipped.

## Files touched

- `supabase/functions/approve-withdrawal/index.ts` — only file edited.

Reply **approve** to proceed.
