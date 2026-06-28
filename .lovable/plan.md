# Merchant-fulfilled landlord-float payouts

## Goal
When an agent pays a landlord from their **landlord-payout float**, instead of the agent disbursing directly, the request lands in the merchant agent's payout queue. A merchant claims it, pays the landlord (MoMo / cash / bank), and confirms — exactly like a normal user withdrawal. The merchant gets full principal reimbursement to their withdrawable wallet + 0.5% commission + SMS. The page is renamed to **"Cash, Mobile Money & Bank Payouts"**.

## Money flow
```text
CFO funds agent landlord-float (existing)
        │
Agent taps "Pay landlord" → creates withdrawal_requests row (landlord = recipient)
   • agent_landlord_float balance HELD (reduced) immediately
   • status = pending  → appears in merchant queue
        │
Merchant claims → pays landlord with own MoMo/cash/bank → confirms (approve-withdrawal)
   • Float source debited via ledger (agent_float_used_for_rent on agent)
   • Merchant principal reimbursed → merchant withdrawable wallet  (company funds)
   • Merchant 0.5% commission → merchant withdrawable wallet
   • Merchant SMS (same as today)
   • Landlord SMS confirmation
        │
On reject → held float restored to agent_landlord_float
```

## Changes

### 1. Withdrawal creation (frontend)
`AgentFloatPayoutWizard.tsx`: replace the "agent disburses directly" disburse step with a **"Send to merchant payout queue"** action. It will:
- Validate landlord name/phone/provider and the chosen channel (MoMo / cash / bank).
- Reduce `agent_landlord_float.balance` (hold), mirroring today's optimistic reduction + rollback-on-error.
- Insert a `withdrawal_requests` row with:
  - `user_id = agent.id`, `agent_id = agent.id`
  - `amount`, `payout_method` (`mobile_money` | `cash` | `bank_transfer`)
  - `mobile_money_number/provider/name` OR `bank_*` = **landlord's** details
  - `beneficiary_id = landlord_id`, `reason = "Landlord float payout — <landlord name> (rent #...)"` as the detection marker
  - `status = 'pending'`
- Keep the existing GPS capture/landlord-OTP gates that already protect landlord payouts.

The wizard's direct-TID/receipt disburse path is removed for this flow (merchant now provides the proof).

### 2. `approve-withdrawal` edge function (settlement)
Add a **landlord-float branch** detected by the `reason` marker (+ `beneficiary_id` present, non-proxy, non-pool):
- Skip the requester-withdrawable debit; instead post a ledger debit against the **agent's float** (`category: agent_float_used_for_rent`, `wallet_bucket: float`, `recipient_type: operational_wallet`) for the payout amount — drawing the held float, not the agent's withdrawable.
- Decrement `agent_landlord_float` (committed) and mark the matching `agent_landlord_float_allocations` row paid where applicable.
- Let the **existing** merchant reimbursement + 0.5% commission + merchant SMS blocks run unchanged (they already fire for any cashout-agent-settled non-proxy/non-pool payout).
- Send the landlord confirmation SMS.
- On rejection (`reject-withdrawal`): restore the held `agent_landlord_float.balance`.

### 3. Merchant queue (frontend)
`AgentCashPayoutsTab.tsx`: no query change needed — these rows are real `withdrawal_requests` so they appear automatically. Add a small **"Landlord payout"** badge + landlord name/phone display on the card when `reason` marks it landlord-float, so the merchant knows who to pay.

### 4. Rename the page
- `CashPayouts.tsx` header title → **"Cash, Mobile Money & Bank Payouts"** (subtitle unchanged).
- Update the dashboard trigger label in `AgentDashboard.tsx` to match.

## Notes / safeguards
- Reuses the existing claim/lock/throttle, reimbursement, commission, and SMS machinery — no new wallet-writer paths (respects ledger-fortress + wallet-sole-writer rules).
- Float hold-on-request + restore-on-reject prevents double-spend of the same float.
- Idempotency keys already namespace reimbursement/commission per `withdrawal_id`.

## Technical details
- Detection marker: `reason LIKE 'Landlord float payout%'` AND `beneficiary_id IS NOT NULL`.
- Float debit posted through `create_ledger_transaction` (raw entries array, no stringify) per ledger RPC rules.
- Tables touched: `withdrawal_requests` (insert/read), `agent_landlord_float` (hold/restore), `agent_landlord_float_allocations` (mark paid), `general_ledger` (via RPC). No schema migration required.
