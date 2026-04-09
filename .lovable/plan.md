

# CFO Treasury Dashboard — Implementation Plan

## Current State

- **Ledger schema**: Has `ledger_scope` (wallet/platform/bridge), `direction` (cash_in/cash_out only — no debit/credit), `transaction_group_id` (nullable), `category`. **No `account_type` column exists.**
- **Wallet sync trigger**: Only handles `cash_in`/`cash_out`, clamps at 0 with `GREATEST`
- **CFO Overview**: 472-line dashboard with 7 sections (KPIs, Cash, Receivables, Liabilities, Earnings, Cash Flow, Risk)
- **Treasury controls table**: Does not exist yet
- **Existing directions**: Only `cash_in` and `cash_out` — the user's proposed SQL references `debit`/`credit` and `account_type` which don't match the live schema

## What Gets Built

### Database Changes (3 migrations)

**Migration 1 — Treasury Controls table + seed data**
- Create `treasury_controls` with `control_key`, `enabled`, `updated_by`, `updated_at`
- Seed 7 rows: `auto_roi`, `auto_salaries`, `auto_commissions`, `auto_advances`, `enforce_cash_guard`, `enforce_roi_coverage`, `enforce_wallet_lock`
- RLS: SELECT for cfo/manager/super_admin, UPDATE for cfo/super_admin

**Migration 2 — `create_ledger_transaction` function**
- Adapted to the **actual schema** (uses `cash_in`/`cash_out` not debit/credit, no `account_type`)
- Accepts JSONB array of entries, validates `SUM(cash_in) = SUM(cash_out)`, assigns shared `transaction_group_id`, inserts all entries atomically
- This becomes the mandatory entry point for all new financial writes

**Migration 3 — `validate_treasury_action` function**
- Pre-payout check: computes total platform cash from ledger (deposits - withdrawals across all scopes), verifies sufficient funds
- For withdrawals: checks user's wallet-scope ledger net is sufficient
- Returns boolean or raises exception

### Frontend Changes (3 files)

**`src/hooks/useCFOOverviewData.ts`** — Add 3 new queries:
- **Today's Cash Flow**: Query ledger for today's `cash_in` total, `cash_out` total, net
- **Integrity Diagnostics**: Count of users with wallet-ledger drift > UGX 100, count of recent entries missing `transaction_group_id`, count of negative ledger balances
- **Pending Approvals**: Count + total from `pending_wallet_operations` where status = pending

**`src/components/cfo/CFOOverviewDashboard.tsx`** — Add 4 new sections to existing dashboard:
- **Section: Golden Rule Equation** — Visual row showing `CASH = WALLETS + PLATFORM ± Timing Difference` with color-coded variance
- **Section: Today's Cash Flow** — 3 cards: Cash In Today, Cash Out Today, Net Today
- **Section: Auto-Payout Controls** — 4 toggle switches reading/writing `treasury_controls`, audit-logged
- **Section: Ledger Integrity Alerts** — 3 alert cards (wallet drift count, missing group IDs, negative balances) with green/red indicators

**`src/components/layout/executiveSidebarConfig.ts`** — Rename CFO "Overview" label to "Treasury"

### What This Does NOT Do
- Does not modify existing ledger data
- Does not change existing triggers (sync_wallet_from_ledger stays as-is)
- Does not break existing edge functions
- Does not add `account_type` column (not needed for current flows — can be added later)
- The `create_ledger_transaction` and `validate_treasury_action` functions are created and available but **existing flows are not migrated to use them yet** — that's a separate step

### Schema Adaptation Note
The user's proposed SQL used `debit`/`credit` directions and an `account_type` column. The actual database uses `cash_in`/`cash_out` and has no `account_type`. All functions will be adapted to work with the real schema while preserving the same financial logic (balanced transactions, cash guards, wallet validation).

