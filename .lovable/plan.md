## Plan: Credit Partner Investment to Proxy Agent on Approval

### Problem

When Partner Ops approves a proxy partner, the partner disappears into an "Awaiting returns" state. The approval means the partner's investment amount should be immediately available to the proxy agent for delivery.

### Changes

**1. `src/components/executive/PendingFunderApprovals.tsx` — Credit wallet on approval**

- After approving the assignment, query `investor_portfolios` for the beneficiary's total active investment amount
- Create a `general_ledger` entry: `cash_in`, category `roi_payout`, with `linked_party` set to the partner's ID, credited to the agent's wallet
- Update the agent's wallet balance accordingly
- Show the credited amount in the success toast

**2. `src/components/agent/ProxyPartnerFunds.tsx` — Remove "Awaiting returns" badge**

- Replace the "Awaiting returns" badge (line 312) with "Ready for delivery" or simply show the zero balance without a misleading label
- **the partnes with awaiting returns are those who are ready to withdraw for their returns**
- Partners with zero balance but approved status will show USh 0 until the approval ledger entry lands

**3. Database migration — Wallet update function**

- Create or reuse an RPC function (`credit_proxy_approval`) that atomically:
  1. Inserts the ledger entry
  2. Updates the agent's wallet balance
- This prevents race conditions and ensures the wallet stays in sync

### Flow After Fix

```text
Partner Ops approves → 
  1. Assignment marked approved/active
  2. Partner's investment_amount queried from investor_portfolios
  3. Ledger entry created (cash_in / roi_payout) on agent's wallet
  4. Agent's wallet balance updated
  → Partner appears in Proxy Partners tab with available balance
  → Agent can withdraw and deliver to partner
```

### Technical Details

- **the partnes with awaiting returns are those who are ready to withdraw for their returns**

- Category: `roi_payout` with `ledger_scope: 'wallet'` to match existing proxy partner fund logic
- The `linked_party` field ties the ledger entry to the specific partner
- Source table: `investor_portfolios`, source ID: the portfolio ID
- If a partner has multiple active portfolios, sum all `investment_amount` values