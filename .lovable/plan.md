

# Fix: Funder Wallet Should Be Zero After Investment Approval

## Problem

When a manager approves a `supporter_facilitation_capital` operation, the `sync_wallet_from_ledger` trigger credits the funder's wallet with the invested amount. But this money is **invested in a portfolio**, not liquid cash. The funder's wallet should remain at **0** because the agent paid directly into the portfolio on their behalf.

Example: Agent invests UGX 50,000 for Test Man → approval credits Test Man's wallet with 50,000 → but it should be 0 since all 50,000 is in the portfolio.

## Solution

In `approve-wallet-operation/index.ts`, after inserting the initial `cash_in` ledger entry (which credits the wallet via trigger), immediately insert a **corresponding `cash_out` ledger entry** to move the funds from the wallet into the investment portfolio. This keeps the ledger fully auditable (money came in, then was invested) while leaving the wallet balance at **0**.

## Changes

### 1. `supabase/functions/approve-wallet-operation/index.ts`

After the existing portfolio activation block (lines 160-172), add a second ledger entry:

```typescript
// After activating portfolio for supporter_facilitation_capital...
// Immediately debit wallet → investment (net zero wallet impact)
const investTxGroupId = crypto.randomUUID();
await adminClient.from("general_ledger").insert({
  user_id: op.user_id,
  amount: op.amount,
  direction: "cash_out",
  category: "wallet_to_investment",
  description: `Capital invested into portfolio. Ref: ${op.reference_id}`,
  source_table: "investor_portfolios",
  source_id: op.source_id,
  transaction_group_id: investTxGroupId,
  linked_party: "Rent Management Pool",
  reference_id: op.reference_id,
});
```

This creates a clean audit trail:
- `cash_in` (supporter_facilitation_capital) → wallet credited
- `cash_out` (wallet_to_investment) → wallet debited back to 0

Both entries have `transaction_group_id` so the `sync_wallet_from_ledger` trigger processes both, netting to zero.

### 2. Update notification message

Change the approval notification from "Wallet Credited ✅" to "Investment Activated ✅" for `supporter_facilitation_capital` operations, since money isn't staying in the wallet.

### 3. No dashboard changes needed

The `PortfolioSummaryCards` already shows `portfolioTotal` (from `investor_portfolios`) as "Total Invested" and doesn't display wallet balance. With the wallet correctly at 0, everything aligns.

