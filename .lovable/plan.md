## Scope

Focused on the **Cash-Out Agents tab of the CFO Dashboard** (`CashoutAgentManager` + its dialogs and the shared `MerchantClaimsLog`). Reflecting your decisions: charges are **company-borne and auto-computed**, the flow stays **claim → done** (no heavy multi-stage approval), and the CFO gets **transaction-type filters + the ability to assign an agent to a transaction type**. Other spec sections (operational-expenses/landlord-payout standalone modules, full audit-log console) are deferred to later passes.

## What already exists (no rebuild needed)
- `cashout_agents` already stores per-agent capabilities: `handles_bank`, `handles_mtn`, `handles_airtel`, `handles_cash` — this IS "assign an agent to a transaction type". The Assign/Edit dialogs already toggle these.
- Method filters (MoMo / Bank / Cash) exist in both the manager list and the Pending Withdrawals dialog.
- Telecom charge + 0.5% commission are already computed per payout in the drill-down.
- Float "Request float" button already disables while a request is `pending` (spec #9 already satisfied).

## Phase 1 — Cash-Out Claim Comments (the main gap)

New table `public.cashout_claim_comments`:
```text
id, withdrawal_id (fk withdrawal_requests), author_id (fk auth via profiles),
author_role text, comment text, status text (nullable), created_at
```
- RLS + GRANTs: any finance/ops role (cfo, coo, manager, financial_ops, super_admin) and the assigned cash-out agent can INSERT and SELECT; no UPDATE/DELETE (immutable timeline). service_role ALL.
- `useCashoutClaimComments(withdrawalId)` hook: read timeline + add comment (stamps author name/role).
- UI:
  - In the agent drill-down "Payouts Processed" list and in `MerchantClaimsLog` rows: show **latest comment inline** (officer · time · text · status).
  - Claim detail drawer: full comment timeline + an "Add comment" composer (comment text + optional status like Verified / Paid / Failed).
  - New "Cash-Out Merchant List" style row in the CFO tab: Merchant · Amount · Status · Latest comment · Officer · Time.

## Phase 2 — Withdrawal charge as a first-class figure

Display-only (no schema; charge derived from existing `cashoutCharges.ts`, bearer = Company):
- Each payout/claim row shows **Requested / Charge / Net paid** and a "Bearer: Company" tag.
- Add a "Total withdrawal charges" KPI tile to the tab header and drill-down.

## Phase 3 — Transaction-type filters + assignment surfacing

- Add a prominent **Bank vs Mobile Money** split (tabs/segment) to the payouts list and Pending Withdrawals dialog (bank already separated in the dialog; make it consistent and add a per-agent "specialization" badge derived from `handles_*`).
- Make the Assign/Edit dialog wording explicit: "Assign transaction types this agent handles" (Bank slip / Mobile Money / Cash).

## Technical notes
- Migration only creates the comments table (CREATE TABLE → GRANT → ENABLE RLS → POLICY, in that order).
- All amounts via `formatUGX`; charges via `getTelecomSendingCharge`.
- No changes to ledger/wallet logic — comments and charge display are additive.

## Sequencing
Build Phase 1 first (migration + UI), verify with a typecheck/build, then Phase 2 and 3. I'll check in after Phase 1 before proceeding.