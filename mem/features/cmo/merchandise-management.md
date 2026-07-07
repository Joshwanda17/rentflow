---
name: CMO Merchandise Management
description: CMO dashboard Merchandise tab tracking branded merch purchases, sales, inventory, COGS/profit and client credit receivables
type: feature
---
# CMO Merchandise Management

New **Merchandise** tab on the CMO dashboard (`/cmo/dashboard?tab=merchandise`), sidebar id `merchandise`.

## Data model (Lovable Cloud)
- `merchandise_purchases`: item_name, quantity, unit_cost, total_cost, purchase_date, supplier, notes, created_by.
- `merchandise_sales`: item_name, quantity, unit_price, unit_cost (COGS/unit), total_revenue, client_name, client_phone, payment_status (`paid`|`credit`|`partial`), amount_paid, amount_outstanding, sale_date, notes, created_by.
- RLS: full access only to roles `cmo`, `manager`, `super_admin` via `has_role`. Grants to authenticated + service_role. No wallet/ledger impact (standalone marketing bookkeeping).

## Component
- `src/components/executive/MerchandiseManager.tsx`. Rendered by `CMODashboard` when `activeTab==='merchandise'` (CMODashboard is now a switch: merchandise vs internal `CMOMarketingDashboard`).
- Tables are not yet in generated Supabase types -> queried via `const db = supabase as any`.
- Derived metrics computed client-side: current stock = purchased - sold; inventory value = stock x weighted-avg purchase cost; gross profit = revenue - COGS; receivables grouped by client phone/name.
- Filters: date range, product, client. Two dialogs: Record Purchase, Record Sale (sale auto-suggests unit_cost from weighted-avg purchase cost, warns on overselling stock).
- Amounts use formatUGX.

## Automated wallet recovery (replaces manual CFO balance corrections)
When merchandise is sold on credit/partial to a **registered customer**, the cost is recovered
automatically from their Withdrawable Wallet — no more manual `CFO Debit [🔧 Balance Correction]`.

- `merchandise_sales.customer_id` (nullable) links a sale to a registered buyer.
- **`trg_create_merchandise_recovery_plan`** (AFTER INSERT on `merchandise_sales`): when
  `amount_outstanding > 0`, resolves the customer from `customer_id` or by matching
  `client_phone` to `profiles.phone` via `normalize_phone_9` (last-9-digits). If resolved,
  inserts a row into `merchandise_recovery_plans`. Unregistered buyers stay plain receivables.
- **`merchandise_recovery_plans`**: sale_id, customer_id, item_name, original_amount,
  outstanding_balance, amount_recovered, daily_rate (0.15), status (active|completed|cancelled),
  last_recovery_at. **`merchandise_recovery_deductions`**: per-deduction audit log.
- **`recover_merchandise_from_wallets()`** (SECURITY DEFINER, EXECUTE→service_role) — daily
  pg_cron `recover-merchandise-from-wallets` at `0 9 * * *` (12:00 EAT). For each active plan reads STRICT
  withdrawable via `get_user_available_balance`, deducts
  `least(outstanding, available, greatest(round(available*0.15),1))` via
  `create_ledger_transaction`: wallet leg (`cash_out`, category `wallet_deduction`,
  recipient_type `user`, bucket `withdrawable`, description
  `Merchandise Payment – <item> (Daily 15% Recovery)` — production, shows in wallet statement)
  + platform leg (`cash_in`, category `debt_recovery`, recipient_type `operational_wallet`).
  Idempotent per plan per day (`merch_recover_<plan>_<YYYYMMDD>`). Updates the plan, logs the
  deduction, and keeps the originating sale's `amount_outstanding`/`payment_status` in sync.
- RLS: cmo/cfo/manager/super_admin manage; customers can read their own plans + deductions.
- Dashboard: MerchandiseManager shows Recovered-to-Date / Customers-Repaying /
  Remaining-to-Recover / Fully-Paid KPIs + a "Merchandise Wallet Recovery (Daily 15%)" table.
