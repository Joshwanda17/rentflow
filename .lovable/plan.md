# Allow Proxy Agents to Withdraw Without TID/Payout Details

## Problem

Proxy agents are currently required to select a payout method (MTN, Airtel, Cash) and enter MoMo recipient details before submitting a withdrawal. This is unnecessary friction — Financial Ops should handle payout method selection and TID confirmation during approval.

## What Changes

### 1. Simplify `AgentProxyWithdrawalDialog.tsx`

- **Should select**  the payout method selector (MTN / Airtel / Cash buttons)
- **Put**  the MoMo recipient name and phone number fields
- **Keep** only: Amount, Reason, and the audit warning
- Submit the withdrawal request with `payout_method: null` (Financial Ops decides how to pay)
- Update validation: only require `amount >= 500`, `amount <= walletBalance`, and `reason >= 10 chars`

### 2. Update `FinOpsWithdrawalVerification.tsx` — Add Proxy Agent Badge

- When a withdrawal's `reason` contains `[Agent proxy:]`, show a "Proxy Agent" badge on the card so Financial Ops knows this was submitted by an agent on behalf of a funder
- The approval dialog already requires payment method + TID/reference — no changes needed there

### Files Changed

1. `src/components/agent/AgentProxyWithdrawalDialog.tsx` — Remove payout method, MoMo fields, simplify validation
2. `src/components/financial-ops/FinOpsWithdrawalVerification.tsx` — Add proxy agent indicator badge