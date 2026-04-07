

# Fix: Portfolio Top-Ups Classified as Deposits

## Problem
Portfolio top-ups are inconsistently classified across 3 edge functions:
- `portfolio-topup` (self-service): `direction: "cash_out"` in `pending_wallet_operations` — shows as withdrawal
- `coo-wallet-to-portfolio`: `direction: "cash_out"` in `pending_wallet_operations` — shows as withdrawal  
- `manager-portfolio-topup`: `direction: "cash_in"` — already correct

## Fix

### Edge Functions (2 files)

**`supabase/functions/portfolio-topup/index.ts`** (line 113):
- Change `direction: "cash_out"` → `"cash_in"` in `pending_wallet_operations` insert
- The wallet-scope ledger entry (line 135, `direction: "cash_out"`) stays as-is — that correctly triggers the wallet deduction via the sync trigger

**`supabase/functions/coo-wallet-to-portfolio/index.ts`** (line 117):
- Change `direction: "cash_out"` → `"cash_in"` in `pending_wallet_operations` insert
- The wallet-scope ledger debit (line 151) stays — it correctly deducts from wallet

### Frontend — Financial Ops Display

**`src/components/financial-ops/ApprovalQueue.tsx`**:
- In the `wallet_ops` query mapping (~line 202), add logic so items with `operation_type === 'portfolio_topup'` display with a deposit icon/badge instead of a generic wallet operation label

### No changes needed:
- `manager-portfolio-topup` already uses `direction: "cash_in"` 
- `useFinancialStatements.ts` already counts `pending_portfolio_topup` as a deposit in cash flow
- `apply-pending-topups` ledger entry already uses `direction: "credit"`

## Summary
2 edge function direction fixes + 1 frontend display tweak. The ledger entries remain correct (debit from wallet scope, credit to platform scope).

