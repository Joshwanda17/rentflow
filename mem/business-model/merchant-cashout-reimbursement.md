---
name: Merchant cash-out principal reimbursement
description: When a merchant (cashout) agent settles a withdrawal, the full principal is reimbursed to their withdrawable wallet (they fronted their own MTN/Airtel cash), plus 0.5% commission
type: feature
---
A merchant (cashout) agent pays the withdrawing user out of their OWN MTN/Airtel float. In `approve-withdrawal`, when the settler is an active `cashout_agents` row (`isCashoutAgent`), the function posts TWO credits to the merchant's **withdrawable** wallet:

1. **Principal reimbursement** (NEW, 2026-06): full payout `amount` — category `wallet_withdrawal`, platform `cash_out` ↔ merchant wallet `cash_in`, `recipient_type:'user'` → withdrawable. Idempotency key `approve-withdrawal-merchant-reimbursement-<withdrawal_id>`. Gated to `!isProxyPayout && !poolFunded && user.id !== fundingUserId`.
2. **0.5% commission** — `Math.round(amount*0.005)`, category `agent_commission_earned`, reference `<withdrawal_id>-cashout-commission`.

Net economic effect: principal moves from the withdrawing user's withdrawable bucket → the merchant's withdrawable bucket (platform nets zero on `wallet_withdrawal`), and the company pays the 0.5% commission expense on top. One combined SMS confirms both. Response exposes `merchant_reimbursed` + `cashout_commission`; `AgentCashPayoutsTab` toasts both.
