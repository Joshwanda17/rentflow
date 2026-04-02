

# Angel Pool: Full Backend Integration + Test Seeding

## Overview

The Angel Pool is currently a **UI-only mock** — the invest button shows a toast, no database table exists, no wallet deduction happens, and all dashboard data is hardcoded. This plan wires the full backend: table, edge function, real data hooks, and test funds.

## Steps

### 1. Database Migration — `angel_pool_investments` table

Create table with RLS:

```sql
CREATE TABLE public.angel_pool_investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id UUID NOT NULL REFERENCES public.profiles(id),
  amount BIGINT NOT NULL,
  shares INTEGER NOT NULL,
  pool_ownership_percent NUMERIC(10,6) NOT NULL,
  company_ownership_percent NUMERIC(10,6) NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  transaction_group_id UUID,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.angel_pool_investments ENABLE ROW LEVEL SECURITY;

-- Users see own investments
CREATE POLICY "Users view own angel investments"
  ON public.angel_pool_investments FOR SELECT TO authenticated
  USING (investor_id = auth.uid());

-- Staff see all
CREATE POLICY "Staff view all angel investments"
  ON public.angel_pool_investments FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'cfo') OR has_role(auth.uid(), 'coo'));
```

### 2. Edge Function — `angel-pool-invest`

New file: `supabase/functions/angel-pool-invest/index.ts`

- Authenticates caller via JWT
- Validates `amount >= PRICE_PER_SHARE (20,000)`
- Calculates: `shares = floor(amount / 20,000)`, `actual = shares * 20,000`, pool %, company %
- Checks pool capacity: `SUM(shares) + new_shares <= 25,000`
- Checks wallet balance >= actual amount
- Inserts `cash_out` ledger entry with `transaction_group_id` (triggers `sync_wallet_from_ledger` automatically)
- Inserts into `angel_pool_investments`
- Logs system event via `logSystemEvent` (event-driven)
- Returns: shares, ownership %, reference_id, new balance

### 3. Seed Test Funds

Call existing `seed-test-funds` edge function to add UGX 5,000,000 to SSENKAALI PIUS (`0b109aad-212a-4fd0-ab03-3d7aee9cf397`).

### 4. Wire Frontend — `FunderCapitalOpportunities.tsx`

Replace the toast-only `handleAngelInvest` (line 222-229) with:

```ts
const { data, error } = await supabase.functions.invoke('angel-pool-invest', {
  body: { amount: angelAmount }
});
```

On success: show toast with shares + reference_id, refresh wallet via `CustomEvent`. On error: show error toast.

### 5. New Hook — `src/hooks/useAngelPoolData.ts`

Fetches real pool state from `angel_pool_investments`:
- Total raised, shares sold, shares remaining, progress %
- User's own investments
- Top investors (aggregated, joined with `profiles.full_name`)
- Exposes all values for dashboard consumption

### 6. Update `AngelPoolDashboard.tsx` — Replace Mock Data

Remove `MOCK_TOTAL_RAISED` and `MOCK_INVESTORS` imports. Use `useAngelPoolData` hook. All KPIs and leaderboard become live database-driven.

## Event-Driven Compliance

- Every investment creates a `system_event` via `logSystemEvent` with type `angel_pool_investment`
- Wallet deduction happens through the ledger trigger (`sync_wallet_from_ledger`), not direct balance edits
- All money movement is append-only via `general_ledger`

## Verification Checklist (500k test)

| Metric | Expected |
|---|---|
| Shares | 25 |
| Pool Ownership | 0.10% |
| Company Ownership | 0.008% |
| Wallet After | 4,500,000 |
| Ledger Entry | cash_out, angel_pool_investment |
| System Event | angel_pool_investment logged |

## Files

- **DB migration**: `angel_pool_investments` table + RLS
- **New**: `supabase/functions/angel-pool-invest/index.ts`
- **New**: `src/hooks/useAngelPoolData.ts`
- **Edit**: `src/components/supporter/FunderCapitalOpportunities.tsx` (lines 222-229)
- **Edit**: `src/components/angel-pool/AngelPoolDashboard.tsx` (replace mock imports with hook)
- **Seed**: 5M UGX via `seed-test-funds` for SSENKAALI PIUS

