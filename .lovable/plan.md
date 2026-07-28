## Daily Wallet Financial Summary Report

### 1. Database (migration)

New table `public.daily_wallet_reports`:
- `report_date` (date, unique), `period_start`, `period_end` (timestamptz)
- `deposits_by_source` (jsonb: cash / mtn / airtel / bank → {count, amount})
- `payouts_by_channel` (jsonb: merchant_mtn / merchant_airtel / merchant_equity → {count, amount})
- `total_deposited`, `total_paid_out`, `closing_balance` (numeric)
- `pdf_path`, `xlsx_path` (text, in `finops-reports` storage bucket)
- `generated_by` (text, default `system`), `generated_at`
- RLS: read for FinOps roles (`cfo`, `financial_ops`, `super_admin`, `manager`); insert/update `service_role` only

New storage bucket `finops-reports` (private).

### 2. Ledger source view

Create SQL function `public.compute_wallet_report(_start timestamptz, _end timestamptz)` returning jsonb. Reads directly from `general_ledger` (never wallet cache):
- Deposits: `direction='cash_in'`, `classification='production'`, `category IN ('deposit_cash','deposit_mtn','deposit_airtel','deposit_bank')` (mapped from actual production categories — verified before writing)
- Payouts: `direction='cash_out'`, category matching merchant payout categories, sub-grouped by provider metadata / sub_category
- Excludes admin_correction / system_balance_correction / test_dev

I'll verify the exact production category strings from `general_ledger` before finalising the SQL.

### 3. Edge function `generate-daily-wallet-report`

- Accepts `{ date?: 'YYYY-MM-DD', period_start?, period_end?, email?: boolean }`
- Computes report via RPC, upserts row in `daily_wallet_reports`
- Renders PDF (pdf-lib) and XLSX (SheetJS via esm.sh) with UGX formatting + thousands separators, uploads to storage
- When `email=true`, sends Mailgun email (existing connector) with PDF + XLSX attachments to the 3 recipients
- Idempotent per `report_date`

### 4. Cron

`pg_cron` job at `0 21 * * *` UTC (= 00:00 EAT next day) → `net.http_post` to the edge function with `{ date: yesterday, email: true }`. Registered via `supabase--insert` (contains project URL + anon key).

### 5. Frontend — FinOps Reports tab

New route/component in FinOps hub: `Reports` tab.
- Filter chips: Today / Yesterday / This Week / This Month / Custom (calendar range)
- List of stored reports (search by date, filter)
- Row actions: View, Download PDF, Download XLSX, Download CSV (client-generated), Regenerate (calls edge fn for that date)
- Detail drawer showing all sections (header, deposit breakdown, payout breakdown, closing balance) computed via same RPC for live/custom ranges
- All amounts via existing `formatUGX` helper; timestamp in EAT

### 6. Files touched / added

- `supabase/migrations/*` — table, RPC, RLS, storage bucket, GRANTs
- `supabase/functions/generate-daily-wallet-report/index.ts`
- `src/components/financial-ops/ReportsTab.tsx`
- `src/components/financial-ops/DailyWalletReportDetail.tsx`
- `src/hooks/useDailyWalletReport.ts`
- Register tab inside existing FinOps hub component
- `supabase--insert` call to schedule the cron

### Verification

Before writing the RPC I'll query `general_ledger` for the actual deposit/payout category strings in use for cash / MTN / Airtel / bank / merchant payouts so grouping matches production data. Cross-check the first computed report against a known day.

### Note

Follow-up (not in this plan) — if you want the report also visible to the CEO/COO dashboards, say so and I'll extend the RLS read list.
