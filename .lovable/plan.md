

# Fix: Manual Rent Collection — Ledger-Based Wallet Deductions

## Problem
The `manual-collect-rent` edge function directly updates the `wallets` table for both tenant and agent deductions. This bypasses the `sync_wallet_from_ledger` trigger, violating the Single-Writer financial integrity principle. It also incorrectly writes deduction records to `pending_wallet_operations` instead of `general_ledger`.

This means:
- Wallet balances can drift from ledger totals
- Agent wallet deductions (when tenant wallet is empty) may not sync properly
- No `role_type` on entries, risking misallocation across role-based wallets

## Fix

### Update `supabase/functions/manual-collect-rent/index.ts`

Replace **direct wallet updates** with **general_ledger inserts** that include `transaction_group_id` (which triggers `sync_wallet_from_ledger` automatically).

**Tenant deduction (lines 157-197):**
- Remove: `supabase.from("wallets").update(...)` 
- Replace with: `supabase.from("general_ledger").insert({ user_id, amount, direction: 'cash_out', category: 'rent_repayment', transaction_group_id, role_type: 'tenant', ... })`
- Still verify tenant has sufficient balance by reading from `wallets` first (read-only check)

**Agent deduction (lines 199-245):**
- Remove: `supabase.from("wallets").update(...)`
- Replace with: `supabase.from("general_ledger").insert({ user_id: agent_id, amount, direction: 'cash_out', category: 'rent_repayment', transaction_group_id, role_type: 'agent', ... })`
- Same read-only balance check before inserting

**Key changes:**
- All wallet mutations go through `general_ledger` → trigger handles balance
- Add `role_type: 'tenant'` for tenant entries, `role_type: 'agent'` for agent entries
- Add `scope: 'wallet'` on all entries
- Remove all `pending_wallet_operations` inserts for deductions (those are for approval flows, not direct deductions)
- Keep notifications, SMS, audit logs, and commission logic unchanged

## Summary

| What | Before | After |
|------|--------|-------|
| Tenant deduction | Direct `wallets.update()` | `general_ledger.insert()` with `transaction_group_id` |
| Agent deduction | Direct `wallets.update()` | `general_ledger.insert()` with `transaction_group_id` |
| Deduction record | `pending_wallet_operations` | `general_ledger` |
| Role tagging | Missing | `role_type: 'tenant'` / `'agent'` |
| Balance sync | Manual calculation | Automatic via `sync_wallet_from_ledger` trigger |

**File changed:** `supabase/functions/manual-collect-rent/index.ts`

