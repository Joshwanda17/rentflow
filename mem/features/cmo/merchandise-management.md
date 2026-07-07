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
