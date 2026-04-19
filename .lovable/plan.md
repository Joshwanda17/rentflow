

## What changed already (from prior partial work)
- Page title "💸 Merchant Payouts" ✅
- Role banner says "Merchant Agent" with MoMo/Bank/Cash framing ✅
- `WithdrawalPayoutCard` already shows method-aware instructions and dynamic placeholders (TID for MoMo/Bank, Payout Code for Cash) ✅
- Edge function `approve-withdrawal` already accepts `reference` + `payment_method` and writes them to ledger + `withdrawal_requests` ✅

## What's still left

The spec is essentially behavior-correct. Three small polish items remain to fully kill the "cash-only mindset":

### 1. `src/components/agent/AgentCashPayoutsTab.tsx`
- Reframe the standalone **"Verify Cash Payout Code"** card: keep the existing UI, just retitle to **"Verify Cash Pickup Code (optional)"** and update the helper text to: *"Use this only when a user came in person with a pre-generated WPO-XXXXX cash pickup code. For Mobile Money, Bank, or coordinated cash payouts, claim from the queue below instead."*
- Update the "Today's Performance" card heading from leftover "Cash Payouts" wording to **"Merchant Payouts"** (the metrics now count all confirmed payouts, not just cash).
- Comments referencing "cash-out agent" stay (internal naming of `cashout_agents` table), but UI labels become "Merchant Agent".

### 2. `src/components/cfo/CashoutPendingWithdrawalsDialog.tsx`
- Update visible copy from "cash-out agents" → **"Merchant Agents"** in the dialog description so CFO sees consistent terminology.

### 3. `src/components/withdrawals/WithdrawalPayoutCard.tsx`
- Tiny copy tweak on the "AWAITING PAYMENT" warning so the language is method-neutral (already mostly fine; just ensure the staleness hint says "claim expires in 10 min" instead of any delivery-style phrasing — current text is fine, leaving as-is).

### What we are NOT changing
- No DB migration needed — `withdrawal_requests` already has `assigned_cashout_agent_id`, `dispatched_at`, `fin_ops_reference`, `fin_ops_payment_method`, `payout_method`.
- No edge function changes — `approve-withdrawal` already handles method-tagged proof.
- No queue / claim / 10-min lock rewrite — already in place.
- The `cashout_agents` table and internal identifiers stay (rename-in-DB would be invasive and risky); only the **user-facing label** becomes "Merchant Agent".

## Files to edit
1. `src/components/agent/AgentCashPayoutsTab.tsx` — reframe cash-code card title/help text and "Today's Performance" labels.
2. `src/components/cfo/CashoutPendingWithdrawalsDialog.tsx` — swap "cash-out agents" → "Merchant Agents" in the description.

Two surgical text edits, no logic, no UI restructuring.

<lov-actions>
<lov-suggestion message="Apply the plan: reframe the cash-code card and CFO dialog to Merchant Agent terminology.">Apply the plan</lov-suggestion>
<lov-suggestion message="Test the merchant payout end-to-end: claim a MoMo, Bank and Cash withdrawal, enter TID/payout code and confirm.">Verify it works end-to-end</lov-suggestion>
<lov-suggestion message="Add a 'Reassign to Financial Ops' button on stale claims (over 10 min) so high-value or stuck payouts can be escalated.">Escalation to Financial Ops</lov-suggestion>
<lov-suggestion message="Add a high-value threshold (e.g. UGX 1,000,000) that auto-routes withdrawals to Financial Ops only and hides them from Merchant Agents.">High-value routing</lov-suggestion>
</lov-actions>
