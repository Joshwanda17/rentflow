

## Plan: Dynamic Capital Opportunity Reduction on Supporter Investment

### What happens today
- The "RENT NEEDED NOW" amount in `FundingPoolCard` is **hardcoded** as `POOL_TOTAL = 758,300,000`.
- When a supporter taps "Support Tenant" and funds via `FundRentDialog`, the `fund-rent-pool` edge function deducts from their wallet and records in the ledger — but the displayed opportunity amount never changes.
- The manager's `SupporterPoolBalanceCard` already reads pool funds from the ledger via an RPC.

### What needs to change

**1. Edge Function Update (`fund-rent-pool/index.ts`)**
After deducting from the wallet and recording in the ledger, the function will also **reduce** `total_rent_requested` in the `opportunity_summaries` table by the funded amount. This ensures the "RENT NEEDED NOW" figure decreases with each investment.

**2. FundingPoolCard Update (`FundingPoolCard.tsx`)**
- Remove the hardcoded `POOL_TOTAL = 758,300,000`.
- Use `summary.total_rent_requested` as the dynamic "RENT NEEDED NOW" value.
- All derived metrics (available, utilized, utilization %) will recalculate from this live value.
- The existing realtime subscription in `useOpportunitySummary` will automatically refresh the card when the summary row is updated.

**3. FundRentDialog Cap Validation**
Already in place — the dialog prevents funding more than `summary.total_rent_requested` and caps at wallet balance. After the edge function reduces the summary, subsequent supporters will see the reduced opportunity.

### Data flow after changes

```text
Supporter taps "Support Tenant"
  → FundRentDialog opens (shows wallet balance, remaining opportunity)
  → Submits amount
  → fund-rent-pool edge function:
      1. Deducts from wallet (optimistic lock) ✅ exists
      2. Records ledger entry (supporter_rent_fund) ✅ exists
      3. Reduces opportunity_summaries.total_rent_requested ← NEW
      4. Sends notification ✅ exists
  → Realtime triggers useOpportunitySummary refresh
  → FundingPoolCard shows reduced "RENT NEEDED NOW"
  → Manager's SupporterPoolBalanceCard shows increased pool balance ✅ already works
```

### Files to modify
- `supabase/functions/fund-rent-pool/index.ts` — add `UPDATE opportunity_summaries SET total_rent_requested = total_rent_requested - amount`
- `src/components/supporter/FundingPoolCard.tsx` — replace hardcoded `POOL_TOTAL` with `summary.total_rent_requested`

