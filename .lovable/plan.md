## Why

Right now the Wallet Deductions list shows a single "Available (ledger)" figure that is actually `wallets.balance` = **withdrawable + float**. Float is company money we owe back to the user (rent supporters' parked funds, agent float, etc.) and must never be visually merged with their own withdrawable cash.

Confirmed from DB on the current 229 wallets:
- 217 wallets carry withdrawable balances (UGX 144,122,644 total)
- 22 wallets carry float (UGX 1,262,426 total — company liability)
- Example: LOLEM FIRICILA shows UGX 2,199,539 but only UGX 1,597,133 is hers; UGX 602,406 is float we owe her

## What changes

### 1. RPC `search_wallets_by_balance` returns the breakdown
Migrate the function to also return `withdrawable_balance` and `float_balance` (keeps the same `balance` total for back-compat). Filter range still uses `wallets.balance` so the count keeps matching the hero "229 with balance" pill.

### 2. Wallet Deductions list (`WalletDeductionPanel.tsx`)
Each row now shows two stacked figures on the right:

```text
Withdrawable     UGX 1,597,133
Float (owed)     UGX 602,406      ← amber pill, only when > 0
```

- Rows with zero withdrawable but float > 0 get a small "Float only — company liability" tag so an operator never deducts from money we owe.
- The list summary header changes from one total to two:
  `217 with withdrawable · UGX 144.1M  ·  22 carry float · UGX 1.26M`

### 3. Selected-user card
Replace the single "Available: UShX" line with a two-row breakdown:
- Withdrawable (deductible) — bold
- Float (company owes user) — muted amber, with helper text "Not deductible from this tool"

The amount-vs-available validation already gates on `trueBalance` (ledger withdrawable), so deduction safety is unchanged — this is purely making the display honest.

### 4. Direct-table fallback
Update the fallback `wallets` query to also select `withdrawable_balance, float_balance` so the same breakdown renders whether RPC or fallback path runs.

## Files
- `supabase/migrations/<new>.sql` — extend `search_wallets_by_balance` return signature
- `src/components/financial-ops/WalletDeductionPanel.tsx` — `UserResult` type, list row, summary, selected-user card, fallback query

## Out of scope
No change to the `wallet-deduction` edge function or to ledger logic. No change to the hero "X with balance" count (still based on `wallets.balance`).