---
name: Merchant float demand forecast (shared-pool coordination)
description: MerchantFloatDemandCard shows a SHARED (global) payout demand queue; every merchant agent sees the same demand, so float requests use a network-aware fair share, not the full gap
type: feature
---
`MerchantFloatDemandCard` (on the Cash/MoMo/Bank Payouts page) forecasts how much float a merchant (cash-out) agent should request from the CFO.

**The demand is GLOBAL, not per-agent.** It sums every available `withdrawal_requests` row (statuses pending/requested/manager_approved/cfo_approved/fin_ops_approved that are unclaimed OR have an expired >15-min claim) — the same pool every one of the ~8 active merchant agents sees. These are ROI cash-outs, landlord float payouts and commission withdrawals the CFO released to users' wallets. The card also splits the demand by channel (MTN / Airtel / other MoMo / bank / cash) and by day, with telecom sending fees on MoMo channels.

**Over-request bug fixed via `get_merchant_float_network_status()`** (SECURITY DEFINER RPC, merchant-only). Because RLS blocks a merchant from reading other agents' float or float_requests, this RPC returns network-wide truth:
- `total_demand` = global available payout principal
- `network_float` = SUM(float_balance) over active merchants (from `v_user_wallet_strict`)
- `pending_requested` = SUM(float_requests.requested_amount) where status='pending' for active merchants
- `active_merchants` = count of `cashout_agents` where is_active
- `net_gap` = max(0, total_demand − network_float − pending_requested)
- `fair_share` = ceil(net_gap / active_merchants)

The card requests **fair_share**, not the full gap, so if all merchants request, the CFO isn't over-funded. Per-day request buttons request `ceil(day.needed / active_merchants)`. When `net_gap === 0` the card shows "Network is fully funded — no request needed". "Needs attention" / low-float alert triggers on `net_gap > 0`.

Requests still flow into `float_requests` (status pending) → CFO "Pay to Wallet" queue → funded under Agent Float Allocation (recipient_type operational_wallet → Float bucket).
