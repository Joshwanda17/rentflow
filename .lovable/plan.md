## Investigation Summary

**Root Cause Found**: The `coo-invest-for-partner` edge function is **missing portfolio creation**. It deducts funds from Benjamin's wallet and records ledger entries, but never creates a record in `investor_portfolios`. The "My Support Accounts" sheet queries `investor_portfolios` — so Benjamin correctly sees zero accounts despite UGX 4,504,800 being invested.

**Evidence**:

- **Ledger**: Two `coo_proxy_investment` entries exist (UGX 2,504,800 + UGX 2,000,000)
- **Portfolios table**: Zero records for Benjamin's user ID
- **Edge function code** (`coo-invest-for-partner/index.ts`): Lines 126–161 only insert ledger entries and a notification — no `investor_portfolios.insert()` call exists

---

## Plan

### 1. Fix the edge function to create portfolio records

**File**: `supabase/functions/coo-invest-for-partner/index.ts`

After the ledger entries (line ~161), insert a portfolio record:

```typescript
await adminClient.from("investor_portfolios").insert({
  investor_id: partner_id,
  agent_id: caller.id,
  portfolio_code: referenceId,
  investment_amount: amount,
  roi_percentage: 15,
  roi_mode: 'simple',
  total_roi_earned: 0,
  status: 'active',
  duration_months: 12,
  payout_day: payout_day,
  next_roi_date: firstPayoutDate,
  maturity_date: maturityDate, // calculated as 12 months from now
  auto_reinvest: false,
});
```

### 2. Backfill Benjamin's two missing portfolios

Create a one-time migration to insert the two portfolio records matching his existing ledger entries:

- **Portfolio 1**: UGX 2,504,800, invested 2026-03-10, payout day 10th, 15% simple ROI, 12 months
- **Portfolio 2**: UGX 2,000,000, invested 2026-03-10, payout day 15th, 15% simple ROI, 12 months

Both set to `active` status with correct `maturity_date` and `next_roi_date`.

### 3. Check for other affected users

Query the ledger for all `coo_proxy_investment` entries and cross-reference with `investor_portfolios` to identify and backfill any other missing portfolio records.

---

### Technical Details

- The `investor_portfolios` table requires columns: `investor_id`, `portfolio_code`, `investment_amount`, `roi_percentage`, `roi_mode`, `status`, `duration_months`
- RLS on `investor_portfolios` allows supporters to SELECT their own records (by `investor_id` or `agent_id`)
- The edge function uses `adminClient` (service role), so RLS won't block the insert

!!!!!!! PERMANENT FIX!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!