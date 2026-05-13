## Goal

Make the CFO `wallet-payout` tab and the agent + FinOps screens reflect this single canonical flow:

```text
CFO          →  funds Agent's Landlord Payout Float (no landlord touched yet)
Agent        →  opens float → picks landlord → MoMo + Withdraw
                → OTP sent to LANDLORD's phone
                → Agent enters OTP → money moves to landlord's MoMo
FinOps       →  uses the MoMo TID to approve / settle the withdrawal
```

The backend already supports this end-to-end (`fund-agent-landlord-float`, `issue-landlord-payout-otp`, `verify-landlord-payout-otp`, `landlord-payout-disburse`, `submit-landlord-payout-receipt`). The work is **UI alignment + a couple of small backend tightenings** so the screens stop implying CFO pays the landlord directly.

## Changes

### 1. CFO — Rent Disbursement Queue (`src/components/cfo/RentDisbursementQueue.tsx`)
Currently labelled "Pay" / "Rent Disbursement Queue" with copy "ready for CFO disbursement", which reads as if CFO pays the landlord. Behind the scenes it already calls `fund-agent-landlord-float`.

- Rename header to **"Fund Agent Landlord Payout Float"**.
- Subcopy: *"COO-approved rent. Funding moves cash into the assigned agent's Landlord Payout Float — the agent then pays the landlord via MoMo + OTP."*
- Per-row button: **"Fund Agent Float"** (not "Pay"). Add small helper text under the agent chip: *"Will land in {agentName}'s Landlord Payout Float."*
- Batch button: **"Fund {n} Agent Floats"**.
- Success toast: *"Funded agent float — agent will complete the MoMo payout."*

### 2. Agent — Landlord Payout Float card (`src/components/wallet/AgentLandlordFloatCard.tsx` + `PayLandlordDialog`)
Already uses OTP flow. Tighten the wording so it matches the redefinition:

- Primary action label on each per-tenant/landlord row: **"Withdraw to Landlord MoMo"**.
- Step 1 of dialog: pick landlord (auto when drilled from allocation), choose MoMo provider (MTN / Airtel), confirm landlord phone.
- Step 2: tap **Send OTP** → calls `issue-landlord-payout-otp` (OTP goes to landlord's phone, 2-min TTL).
- Step 3: agent enters 6-digit OTP → `verify-landlord-payout-otp` → `landlord-payout-disburse` debits the float and creates a `landlord_payouts` row in `pending_finops_disbursement`.
- Show the `payout_id` + amount + landlord MoMo on the success screen so the agent can reference it.

No new backend endpoints; just confirm copy and that `mobile_money_provider` is required before OTP.

### 3. FinOps — TID Approval Queue (`src/components/financial-ops/LandlordPayoutsQueue.tsx`)
Already lists `pending_finops_disbursement` rows. Make TID the explicit gate:

- Each row shows: agent, landlord, MoMo (provider + phone), amount, OTP-verified time.
- Action button: **"Approve with TID"** → modal that REQUIRES:
  - `momo_transaction_id` (TID, mandatory, 6+ chars)
  - optional screenshot upload
- Submit calls existing `submit-landlord-payout-receipt` with the TID → marks payout `settled`, emits `landlord_payout_settled` event.
- Add a "Reject / Refund" path that calls `refund_agent_float_for_payout` (already exists via SLA monitor) so FinOps can return cash to the agent's float if the MoMo failed.

### 4. Small backend tightening
- `landlord-payout-disburse`: keep status `pending_finops_disbursement` (already does). No MoMo gateway call.
- `submit-landlord-payout-receipt`: enforce non-empty `momo_transaction_id` server-side and reject duplicates per `payout_id`.
- Emit `landlord_payout_settled` system event with `{ payout_id, tid, finops_user_id }` for the trust/audit trail (CONSTITUTION compliance).

### 5. Copy / docs
Update the in-app helper tooltip on the CFO tab and the agent float card to state the 4-step flow above so all three roles see the same definition.

## Out of scope
- No schema changes — `landlord_payouts`, `landlord_payout_otp_challenges`, `agent_landlord_float_allocations` already model this.
- No change to wallet routing (`recipient_type='operational_wallet'` → float) or sole-writer rule.
- No automatic MoMo gateway call; this stays human-in-the-loop on the FinOps side via the TID.

## Acceptance
- CFO clicking "Fund Agent Float" never debits a landlord directly; it only increases an agent's Landlord Payout Float.
- Agent cannot withdraw without (a) MoMo provider selected, (b) OTP entered within 2 min.
- FinOps cannot mark a payout settled without a TID.
- Every settled payout produces: `landlord_payouts.status='settled'`, an `agent_visit` (GPS + AI ID), and a `landlord_payout_settled` system event.
