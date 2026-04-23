

## Plan: Restore Agent Float — Fix Misrouted Float Credits

### The Problem

For agents, money meant to fund tenant rent payments (operational float = company money) has been routed into the `withdrawable_balance` bucket instead of `float_balance`. The UI's `useAgentBalances` hook then reads withdrawable, treats every shilling above their commission ledger as "other / unclassified," and the "Float Allocation" RPC sees `float_balance = 0` and blocks rent disbursements.

### Concrete Examples (from live DB)

| Agent | Wallet Balance | Withdrawable | Float | Ledger Commission |
|---|---|---|---|---|
| LUKODDA JOSEPH | 34,000,000 | 34,000,000 | 0 | 74,017,562 |
| ATUHAIRE CAROLYNE | 5,340,397 | 5,340,397 | 0 | 295,000 |
| Akampurira Onesmus | 1,647,200 | 1,647,200 | 0 | 3,677,033 |
| Katongole James | 2,400,000 | 2,400,000 | 0 | 10,059,997 |

In every case `float_balance = 0` despite the agent clearly holding company money. Withdrawable inflated by float credits is also why the previous "lock commission" error appeared.

### Root Cause

`wallet_route_for_category` routes these credit categories to **withdrawable** for ALL users, but for **agents** they are float deposits:

1. `wallet_deposit` — agent cash deposits at the merchant code (the explicit "Operations Float" funding flow)
2. `wallet_transfer` — portfolio top-up funding routed to the agent's wallet for client investments
3. `roi_wallet_credit` — ROI proceeds being held to be paid out to a partner
4. `system_balance_correction` / `cfo_direct_credit` — when description says "operational float" / "portfolio top-up"

There is no role-aware routing. The router treats an agent's wallet identical to a tenant's wallet.

### The Fix (3 parts)

**1. Make routing role-aware in `wallet_route_for_category`** (or add a sibling helper invoked by `apply_wallet_movement`):

For users with the `agent` role, route the following credit categories to **`float`** instead of `withdrawable`:
- `wallet_deposit` (agent cash float top-ups — non-commission)
- `wallet_transfer` (portfolio top-up funding)
- `roi_wallet_credit` (partner ROI being held)
- `agent_proxy_investment` (cash_in side, when funds are being held for a partner)
- `pool_capital_received`, `partner_funding`, `supporter_capital`, `supporter_rent_fund`

Keep these routing to **withdrawable** for agents (real personal earnings):
- `agent_commission_earned`, `agent_commission`, `agent_bonus`
- `partner_commission`, `referral_bonus`, `proxy_investment_commission`
- `agent_investment_commission`, `salary_payout`

For non-agents: behavior unchanged.

**2. One-time reconciliation migration** — for every agent wallet, recompute the correct split from the ledger using the new rules and rewrite the bucket fields atomically (using the `wallet.sync_authorized` session flag). Move misclassified withdrawable funds into `float_balance`. Preserve the invariant `balance = withdrawable + float + advance` (the existing `trg_enforce_wallet_balance_invariant` will keep it safe).

After reconciliation, expected outcomes:
- LUKODDA JOSEPH: withdrawable ≈ 0 (no commission earned has been withdrawn yet sits as "other"), float ≈ 34M
- ATUHAIRE CAROLYNE: withdrawable ≈ 295K (commission), float ≈ 5,045K
- Akampurira Onesmus: withdrawable ≈ matches commission earned-minus-spent, float ≈ rest

**3. Update `useAgentBalances` hook** — already mostly correct. Once routing is fixed, the "drift warning" between withdrawable and commission will naturally vanish because `withdrawable` will only contain real commission. Remove the legacy `otherBalance` fallback wording (or keep it as a safety net for future drift but it should always be 0 after the fix).

### Verification Steps

After the migration runs we'll re-query the agent wallet table and confirm:
1. `float_balance > 0` for every agent who has received a `wallet_deposit` or `wallet_transfer` credit.
2. `withdrawable_balance` ≈ ledger commission balance for each agent (no drift).
3. The "Float allocation blocked — would require commission funds" error disappears for the affected agents.
4. `balance = withdrawable + float + advance` invariant holds (enforced by existing trigger).

### Files to Change

- `supabase/migrations/<new>.sql`
  - Replace `wallet_route_for_category` with a role-aware version (takes `p_user_id`)
  - Update `apply_wallet_movement` to pass `p_user_id` into the router
  - One-time reconciliation block: for each agent, recompute `withdrawable / float` from ledger and `UPDATE wallets` under `set_config('wallet.sync_authorized','true',true)`
- `src/hooks/useAgentBalances.ts` — minor: simplify `otherBalance` (should be ~0 post-fix), keep warning log as a safety monitor.

### Risks & Mitigations

- **Risk**: Mis-routing a category breaks future credits. **Mitigation**: HARD-FAIL is preserved for unknown categories; we only re-route known ones for the `agent` role.
- **Risk**: Reconciliation moves funds an agent already attempted to withdraw. **Mitigation**: We only move credits whose categories indicate float-purpose; commission-earning categories stay in withdrawable. Existing `wallet_withdrawal` debits already came out of withdrawable so the math nets correctly.
- **Risk**: Wallet sole-writer rule. **Mitigation**: All updates go through `apply_wallet_movement` semantics (set sync_authorized flag inside the migration block).

