

## Goal
Cashout agents already see Withdrawals & Payouts (categorized into All / MoMo / Bank / Cash) via `Cash & Bank Payouts` and approve through `approve-withdrawal`. The remaining gap is: **on successful approval, credit the cashout agent 1% commission**.

## Findings

1. `src/components/agent/AgentCashPayoutsTab.tsx` already:
   - Lists all pending withdrawals (`pending`, `requested`, `manager_approved`, `cfo_approved`, `approved`, `fin_ops_approved`)
   - Splits them into **All / MoMo / Bank / Cash** tabs (matches the screenshot pattern)
   - Renders the same `WithdrawalPayoutCard` used by Financial Ops viewer (full payout details visible)
   - Has Claim → Confirm Paid flow that calls `approve-withdrawal`
2. `Cash & Bank Payouts` button in `AgentDashboard.tsx` (line 418) already opens this tab in a dialog for cashout agents.
3. `supabase/functions/approve-withdrawal/index.ts` accepts cashout agents as callers but does **not** pay them a 1% commission.
4. Per memory `agent-incentive-model`, commissions must be a balanced ledger transaction (`agent_commission` cash_in for the agent + `commission_expense` cash_out for the platform), via `create_ledger_transaction` RPC, with `ledger_scope='wallet'` for the credit and `ledger_scope='platform'` for the offset.

## Plan

### 1. Edge function — `supabase/functions/approve-withdrawal/index.ts`
After the main withdrawal ledger transaction succeeds, detect when the caller is a **cashout agent** (not staff) and post a 1% commission:

- Compute `commission = round(amount * 0.01)`.
- Only run this branch when `isCashoutAgent === true && !hasStaffRole && commission > 0`.
- Insert a second `create_ledger_transaction` call with two entries:
  - `user_id = caller (cashout agent), direction='cash_in', category='agent_commission', ledger_scope='wallet', description='Cashout payout commission (1%) for withdrawal <id>'`
  - `direction='cash_out', category='commission_expense', ledger_scope='platform', description='Platform commission expense — cashout payout'`
- Use idempotency suffix `-cashout-commission` to avoid duplicates on retries.
- Wrap in try/catch — commission failure must NOT roll back the successful withdrawal; just log and continue.
- Add the commission amount to the success response payload (`cashout_commission`).

### 2. Frontend toast — `src/components/agent/AgentCashPayoutsTab.tsx`
Update the `completeWithdrawal.onSuccess` toast (line 108) to also surface the commission earned, e.g.:
> "✅ Payout completed — UGX 150,000 sent · You earned UGX 1,500 (1%)"

When `data.cashout_commission > 0`, append the commission line.

### 3. No schema change required
The wallet-derived balance auto-updates from the new ledger entries (per `architecture/financial-flow-integrity` — wallets are caches of ledger).

### 4. No UI categorization change required
The four-tab split (All / MoMo / Bank / Cash) already matches the requested categorization.

## Files to edit
1. `supabase/functions/approve-withdrawal/index.ts` — add 1% commission ledger entry for cashout agents + return `cashout_commission` in response.
2. `src/components/agent/AgentCashPayoutsTab.tsx` — surface commission earned in success toast.

## Out of scope (already working)
- The view itself (already a copy of FinOps view, per `WithdrawalPayoutCard`)
- Channel categorization (already done via Tabs)
- Permission to call `approve-withdrawal` (already granted to active cashout agents)

