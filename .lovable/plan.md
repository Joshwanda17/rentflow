

# Fix: Proxy Partner Wallet Deduction on Withdrawal

## Root Cause

There is a fundamental mismatch in the proxy partner withdrawal flow:

1. **ROI credits go to the AGENT's wallet** (e.g., LUKODDA JOSEPH receives `roi_wallet_credit` on behalf of partners)
2. **The withdrawal dialog inserts `user_id: funderId` (partner's ID)** into `withdrawal_requests`
3. **The DB trigger `deduct_wallet_on_withdrawal_request`** fires on the PARTNER's wallet — but the partner's wallet may not have those funds since ROI was credited to the agent
4. **The wallet balance shown** is fetched from the partner's `wallets` row, which doesn't reflect the actual funds available

This means: money comes in via the agent, goes out via the partner record, and neither wallet correctly tracks the proxy partner's share.

## Solution: Partner-Scoped Virtual Balance + Agent Wallet Deduction

### Step 1: Fix the wallet balance source for proxy partners

Instead of reading from the partner's `wallets` row, compute the proxy partner's available balance from the **agent's ledger entries tagged to that partner**.

Query: sum all `roi_wallet_credit` entries on the agent's wallet where `description LIKE '%on behalf of partner {partnerId}%'` minus sum of completed proxy withdrawals for that partner.

Create a small RPC `get_proxy_partner_balance(agent_id, partner_id)` that returns the computed balance.

### Step 2: Fix the withdrawal to deduct from the AGENT's wallet

Change `AgentProxyWithdrawalDialog` to insert `user_id: agent_id` (the logged-in agent) instead of `funderId`, while storing `funderId` in metadata. This way:
- The existing trigger deducts from the **agent's** wallet (where the money actually sits)
- On rejection, the existing no-op trigger means no refund (money stays deducted as designed)

Add a `proxy_partner_id` column to `withdrawal_requests` to track which partner the withdrawal is for without overriding `user_id`.

### Step 3: Update the UI balance display

In `FunderManagementSheet.tsx` and `FunderDetailView.tsx`, replace the direct `wallets.balance` query with the new RPC, so the displayed balance reflects only that specific partner's share of the agent's wallet.

### Step 4: Handle status transitions properly

- **On INSERT (pending)**: Trigger deducts from agent's wallet immediately (existing behavior, now targeting correct wallet)
- **On CFO approval (completed)**: Balance stays deducted — money is paid out. No further action needed.
- **On rejection**: Add a refund leg back to `handle_withdrawal_approval` trigger, restoring funds to the agent's wallet

## Database Changes

1. **Migration**: Add `proxy_partner_id UUID` column to `withdrawal_requests`
2. **RPC**: Create `get_proxy_partner_balance(p_agent_id UUID, p_partner_id UUID)` that computes available balance from ledger entries
3. **Update trigger**: Modify `handle_withdrawal_approval` to refund agent's wallet on rejection when `proxy_partner_id IS NOT NULL`

## Code Changes

| File | Change |
|------|--------|
| `AgentProxyWithdrawalDialog.tsx` | Insert `user_id: user.id` (agent), add `proxy_partner_id: funderId` |
| `FunderManagementSheet.tsx` | Replace `wallets.balance` query with RPC call |
| `FunderDetailView.tsx` | Use computed proxy balance from RPC |
| `FunderPortfolioCard.tsx` | Display computed balance |

## Technical Detail

```text
BEFORE (broken):
  ROI → Agent Wallet (cash_in)
  Withdraw → Partner's user_id → Trigger tries to deduct Partner's wallet → MISMATCH

AFTER (fixed):
  ROI → Agent Wallet (cash_in, tagged with partner_id)
  Withdraw → Agent's user_id + proxy_partner_id → Trigger deducts Agent's wallet → CORRECT
  Balance shown = SUM(roi credited for partner) - SUM(completed withdrawals for partner)
```

