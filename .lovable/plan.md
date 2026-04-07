

# Set Up Daily Advance Repayment Cron Job (7:00 AM EAT)

## Overview
Schedule the existing `process-agent-advance-deductions` edge function to run daily at 7:00 AM EAT (4:00 AM UTC), while fixing a critical bug in the function that prevents wallet balances from actually updating.

## Critical Bug Fix

The current edge function has two issues that must be fixed before scheduling it:

1. **Missing `transaction_group_id`**: Ledger inserts lack this field, so the `sync_wallet_from_ledger` trigger silently skips them — wallet balances never change.
2. **Reads balance from ledger entries instead of `wallets` table**: It queries `general_ledger` filtering by `category = 'wallet'`, which is unreliable. It should read directly from `wallets.balance`.

## Changes

### 1. Fix the edge function
**File: `supabase/functions/process-agent-advance-deductions/index.ts`**

- Read wallet balance from `wallets` table (consistent with all other financial flows)
- Add `transaction_group_id` to the ledger insert so the `sync_wallet_from_ledger` trigger fires and actually deducts from the wallet
- Use `direction: 'cash_out'` (not `'debit'`) to match the trigger's expected values
- Add idempotency check: skip if a ledger entry for this advance already exists for today
- Add `overdue` status to the query (process both `active` and `overdue` advances)

### 2. Enable pg_cron and pg_net extensions
**Migration** — enable the required extensions for scheduling:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
```

### 3. Schedule the cron job
**SQL insert** (not migration — contains project-specific secrets):
```sql
SELECT cron.schedule(
  'daily-advance-deductions',
  '0 4 * * *',   -- 4:00 AM UTC = 7:00 AM EAT
  $$
  SELECT net.http_post(
    url := 'https://wirntoujqoyjobfhyelc.supabase.co/functions/v1/process-agent-advance-deductions',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon_key>"}'::jsonb,
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);
```

### 4. Add config entry
**File: `supabase/config.toml`** — add function entry if not present (verify_jwt = false).

## Technical Details

**Corrected ledger insert pattern:**
```typescript
const txnGroupId = crypto.randomUUID();
await supabase.from('general_ledger').insert({
  user_id: advance.agent_id,
  amount: amountDeducted,
  direction: 'cash_out',
  category: 'advance_repayment',
  source_table: 'agent_advances',
  source_id: advance.id,
  transaction_group_id: txnGroupId,
  description: `Advance daily deduction - Interest: ${interestAccrued}`,
  transaction_date: today,
});
```

**Idempotency:** Before processing each advance, check if `agent_advance_ledger` already has an entry for `(advance_id, today)` — skip if found.

**Files modified:**
- `supabase/functions/process-agent-advance-deductions/index.ts` — fix ledger writes
- `supabase/config.toml` — ensure function config entry exists
- 1 migration — enable pg_cron + pg_net
- 1 SQL insert — schedule the cron job

