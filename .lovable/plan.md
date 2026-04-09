

# Show Only Commission Balance in Agent Wallet Sheet

## Problem
The FullScreenWalletSheet currently shows the total `wallet.balance` for all roles, including agents. Per the new Float vs Commission segmentation, agents should only see their **Commission balance** (withdrawable money) in this view — not the Float (operational money). Float is for rent operations only.

## What we'll change

### File: `src/components/wallet/FullScreenWalletSheet.tsx`

1. **Import** `useAgentBalances` from `@/hooks/useAgentBalances` and destructure `role` from `useAuth()`

2. **Detect agent context**: `const isAgent = role === 'agent'`

3. **Balance display** (lines 170-184 — the purple gradient card):
   - When `isAgent`: show `commissionBalance` from `useAgentBalances()` instead of `wallet?.balance`
   - Change label from "Available Balance" to "Commission Balance" for agents
   - Optionally show a small "Float: X" subtitle below for awareness (read-only, not the main number)

4. **Withdraw dialog** (line 410): pass `commissionBalance` instead of `wallet?.balance` for agents, so agents can only withdraw up to their commission

5. **Stats section** (lines 250-288 — All-Time Net, Monthly Summary): keep as-is since these are derived from transaction history, not the split balances

### Summary of logic
```text
if (isAgent) {
  displayBalance = commissionBalance   // from useAgentBalances()
  label = "Commission Balance"
  withdrawMax = commissionBalance
} else {
  displayBalance = wallet?.balance      // existing behavior
  label = "Available Balance"
  withdrawMax = wallet?.balance
}
```

### Files changed
1. `src/components/wallet/FullScreenWalletSheet.tsx` — conditionally show commission-only balance for agents

