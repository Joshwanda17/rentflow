# Payroll Growth Bonus (0.5% / day on un-withdrawn payroll)

## Goal
When a staff member receives a payroll credit and chooses NOT to withdraw it, the un-withdrawn portion grows by **0.5% per day** until they withdraw. Growth posts through the ledger (no direct wallet writes) and respects the wallet sole-writer rule.

## Why a tracker table is needed
Today, payroll credits are posted via `cfo-direct-credit` with `platform_category = payroll_expense` but the wallet leg is rewritten to `system_balance_correction` (because `payroll_expense` isn't routable on wallet legs). That means we cannot tell from the `wallets` table or even from the wallet leg alone how much of a user's withdrawable balance came from payroll. We need an explicit tracker.

## Design

### 1. New table: `payroll_growth_balances`
One open row per payroll deposit (FIFO unwind on withdrawal):
- `id uuid pk`
- `user_id uuid`
- `original_amount numeric` (payroll credit amount)
- `current_balance numeric` (un-withdrawn principal + accrued growth)
- `accrued_growth numeric` (running total of bonus posted)
- `daily_rate numeric default 0.005`
- `source_reference_id text` (the `PAY-...` ref from the payroll credit)
- `last_growth_at timestamptz`
- `status text` ('active' | 'depleted')
- `created_at`, `updated_at`

RLS: user can `SELECT` their own rows; only service role / `has_role(auth.uid(),'cfo')` can insert/update.

### 2. Capture payroll on credit
Modify `supabase/functions/cfo-direct-credit/index.ts` so that when `platform_category = 'payroll_expense'` and `op = 'credit'`, after the ledger posts successfully, insert a row in `payroll_growth_balances` with `original_amount = current_balance = amount`, `last_growth_at = now()`.

### 3. Daily growth cron — new edge function `apply-payroll-growth`
Runs daily (pg_cron at 03:00 Africa/Kampala). For each `active` row:
- `growth = current_balance * daily_rate` (compounded daily on remaining balance)
- Post a balanced ledger pair via `create_ledger_transaction` using existing allowlisted categories:
  - Wallet leg: `cash_in`, category `system_balance_correction`, scope `wallet`, recipient = user → routes to **withdrawable**
  - Platform leg: `cash_out`, category `interest_expense` (already allowlisted as expense), scope `platform`, user = a Welile finance system user
  - `description = "Payroll loyalty bonus 0.5%/day [ref=<source_reference_id>]"`
- On success, update tracker: `current_balance += growth`, `accrued_growth += growth`, `last_growth_at = now()`.

Skip rows where `last_growth_at` is within the last 23h to make the cron idempotent.

### 4. Withdrawal unwind (FIFO)
When a payroll-bearing user withdraws, we need to reduce `payroll_growth_balances` so growth stops on withdrawn money. Hook into the existing withdrawal completion path in `supabase/functions/approve-withdrawal/index.ts`:
- After approval succeeds, call a new SQL helper `consume_payroll_growth(_user_id, _amount)` that walks active rows oldest-first, subtracting from `current_balance`, marking rows `depleted` when they hit 0.
- Also called on any `wallet_deduction` debit so CFO clawbacks/agent rent usage correctly stop growth.

### 5. UI surfacing (`src/components/wallet/UnifiedWalletHeroCard.tsx` or equivalent)
For staff with active payroll balances, show a small line under "Withdrawable":
- "Payroll growing at 0.5% / day — UGX X accrued so far"
- Read from `payroll_growth_balances` with `select sum(current_balance), sum(accrued_growth)`.

### 6. Cron registration
Use Supabase insert tool (per `<schedule-jobs-supabase-edge-functions>`) to register a `pg_cron` job calling `apply-payroll-growth` at 03:00 daily.

## Files to add
- `supabase/migrations/<ts>_payroll_growth_balances.sql` — table + RLS + `consume_payroll_growth` function
- `supabase/functions/apply-payroll-growth/index.ts` — daily growth poster
- pg_cron registration (via insert tool, not migration)

## Files to edit
- `supabase/functions/cfo-direct-credit/index.ts` — insert tracker row when `payroll_expense` credit
- `supabase/functions/approve-withdrawal/index.ts` — call `consume_payroll_growth` post-approval
- `src/components/wallet/UnifiedWalletHeroCard.tsx` — show accrued payroll growth line
- `mem://index.md` + new `mem://features/payroll/payroll-growth-bonus.md` — record the rule

## Constraints honored
- Wallet sole-writer: growth flows through `create_ledger_transaction`; no direct wallet UPDATEs.
- Ledger category allowlist: uses only `system_balance_correction` (wallet leg) and `interest_expense` (platform leg) — both already allowlisted.
- Wallet Routing v2: `recipient_type = user` for the wallet leg (lands in withdrawable).
- Trust mission: emit `system_event` `payroll.growth.applied` on each posting day.
- UGX only; standard `PAY-...`/new `PGB-...` reference format.

## Open question (assumed default unless you say otherwise)
- **Compounding**: daily compounding on `current_balance` (so growth grows on growth). If you want simple interest (0.5%/day on the original amount only), tell me and I'll change step 3 to use `original_amount * daily_rate` instead.
- **Cap**: no maximum cap or expiry. If you want a cap (e.g. growth stops after 90 days or at 2x principal), tell me.
