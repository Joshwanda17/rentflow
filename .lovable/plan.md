

# Daily Merchant Agent Commission Report

## What's being built

A scheduled module that aggregates `tenant_merchant_payments` per agent per day, computes a 1% commission, and stores the result in a new `agent_daily_commission_reports` table.

## 1. New table — `agent_daily_commission_reports`

Migration adds:

| column | type | notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `agent_id` | uuid NOT NULL | references `auth.users` (no FK) |
| `report_date` | date NOT NULL | the day being summarized |
| `total_transactions` | integer NOT NULL | row count |
| `total_value` | numeric(14,2) NOT NULL | SUM(amount) |
| `commission` | numeric(14,2) NOT NULL | `0.01 * total_value` |
| `created_at` / `updated_at` | timestamptz | defaults |
| UNIQUE(`agent_id`, `report_date`) | | idempotency |

RLS:
- Agents can SELECT their own rows.
- Managers / CFO / COO / operations can SELECT all.
- INSERT/UPDATE only via `SECURITY DEFINER` RPC (no client writes).

Index: `(report_date DESC, agent_id)` for dashboard queries.

## 2. RPC — `generate_daily_merchant_commission_report(p_date date DEFAULT (CURRENT_DATE - 1))`

`SECURITY DEFINER`, `SET search_path = public`. Logic:

```sql
INSERT INTO agent_daily_commission_reports
  (agent_id, report_date, total_transactions, total_value, commission)
SELECT
  agent_id,
  p_date,
  COUNT(*),
  COALESCE(SUM(amount), 0),
  ROUND(COALESCE(SUM(amount), 0) * 0.01, 2)
FROM tenant_merchant_payments
WHERE payment_date = p_date
GROUP BY agent_id
ON CONFLICT (agent_id, report_date) DO UPDATE
SET total_transactions = EXCLUDED.total_transactions,
    total_value        = EXCLUDED.total_value,
    commission         = EXCLUDED.commission,
    updated_at         = now();
```

Returns the count of agent rows written. Also emits one `system_events` row of type `daily_merchant_commission_report` with `{date, agents_processed, total_commission}` payload (per the Trust Mission constitution rule that all state changes must emit events).

## 3. Edge function — `generate-daily-merchant-commission`

`supabase/functions/generate-daily-merchant-commission/index.ts`:
- Manual `corsHeaders`, `verify_jwt = false` in `config.toml`.
- Service-role client.
- Idempotency guard: skip if `system_events` already has a `daily_merchant_commission_report` event for the target date.
- Accepts optional `{ date: "YYYY-MM-DD" }` body for back-fill; defaults to **yesterday (UTC)**.
- Calls the RPC, returns `{ success, date, agents_processed, total_commission }`.

## 4. End-of-day scheduler

A `pg_cron` job (via the insert tool, not migration — contains project URL + key) runs **daily at 23:55 Africa/Kampala (≈ 20:55 UTC)** and POSTs to the edge function with no body (so it processes "yesterday" relative to the next-day rollover). We use 23:55 local rather than 00:05 UTC so the report lands at the actual end of the business day in Uganda.

```
'daily-merchant-commission-report', '55 20 * * *', net.http_post(...)
```

## 5. No UI changes in this module

The table is queryable from any existing manager/CFO dashboard later. This change is purely backend (table + RPC + edge function + cron). If you want a CFO viewer page, that's a separate follow-up.

## Files touched

- 1 new migration: table + RLS + RPC.
- 1 new edge function: `generate-daily-merchant-commission/index.ts`.
- `supabase/config.toml`: register the function with `verify_jwt = false`.
- 1 insert-tool SQL: `cron.schedule(...)` for end-of-day trigger.

## What does NOT change

- `tenant_merchant_payments` schema is untouched.
- No wallet credits are issued by this module — it's a **report**, not a payout. (Wallet commission payout for merchant agents can be a follow-up that reads from `agent_daily_commission_reports` and posts a single ledger entry per agent per day, going through `create_ledger_transaction` with category `agent_commission_earned`. Confirm if you want that bundled in.)

