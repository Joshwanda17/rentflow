## Plan: Route Agent Commissions Directly to Wallet

### Problem

The current `credit_agent_repayment_commission` trigger does two things when a repayment occurs:

1. Inserts into `agent_earnings` → which fires `sync_agent_wallet_on_earning` trigger → **credits wallet directly**
2. Also inserts into `pending_wallet_operations` with status `'pending'` → queues for manager approval

This creates a conflict: commissions hit the wallet immediately via path #1, but also create a pending approval queue entry via path #2 (which would double-credit if approved).

Additionally, Kiggundu Akram's earnings and wallet were wiped during the previous reconciliation and need to be restored.

### Changes

**1. Fix the commission trigger** (database migration)

- Remove the `pending_wallet_operations` INSERT from `credit_agent_repayment_commission`
- Keep only the `agent_earnings` INSERT, which triggers `sync_agent_wallet_on_earning` to credit the wallet automatically
- This means commissions go straight to wallet — no approval gate needed

**2. Restore Akram's commission data** (data insert)

- Re-insert the corrected commission earnings (5% of actual repayments by his tenants)
- The `sync_agent_wallet_on_earning` trigger will auto-credit his wallet on each insert

**3. Clean up orphaned pending operations** (data cleanup)

- Remove any `pending_wallet_operations` entries for agent commissions that were already credited via the wallet sync trigger, preventing future double-credits

### No UI changes needed

The Agent Earnings page and withdrawal flow already read from `wallets.balance` for the "Available to Withdraw" amount, so once commissions land in the wallet, agents can withdraw normally.  


keep the manager's approval but whenever the tenant pays let the commission be pending in the wallet until the managers approve. Also adjust Akram's commission to 20K 

&nbsp;