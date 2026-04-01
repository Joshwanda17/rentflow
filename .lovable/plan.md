

# Fix: `process-credit-daily-charges` — Broken Wallet Deduction

## Problem

The `process-credit-daily-charges` Edge Function has **two critical bugs** that prevent it from ever deducting money from tenant wallets:

### Bug 1: Balance calculation reads wrong data
The function queries `general_ledger` filtering by `category: 'wallet'` and uses `direction: 'credit'` / `'debit'` to compute balance. But:
- The `general_ledger` has a CHECK constraint: `direction IN ('cash_in', 'cash_out')` — values `'credit'` and `'debit'` **cannot exist** in this table
- So the balance always computes to **0**, meaning it never deducts anything

### Bug 2: Ledger inserts use invalid direction
The function inserts ledger entries with `direction: 'debit'` — this **violates the CHECK constraint** and will throw a database error. The correct values are `'cash_in'` or `'cash_out'`.

### Result
No tenant wallet is ever charged for credit access daily charges. The function silently fails or errors on every run.

---

## Fix

Rewrite `process-credit-daily-charges/index.ts` to follow the same proven pattern as `auto-charge-wallets`:

1. **Read balance from `wallets` table** (not by aggregating ledger entries)
2. **Deduct directly from `wallets` table** with an atomic update
3. **Insert ledger entries with `direction: 'cash_out'`** and a `transaction_group_id` so the `sync_wallet_from_ledger` trigger keeps everything in sync
4. Same for agent fallback: read from `wallets`, deduct, insert `cash_out` ledger entry

### Key changes in the function:

| Current (broken) | Fixed |
|---|---|
| `supabase.from('general_ledger').select().eq('category', 'wallet')` | `supabase.from('wallets').select('balance').eq('user_id', ...)` |
| `direction === 'credit' ? +amount : -amount` | Read `wallet.balance` directly |
| `direction: 'debit'` in insert | `direction: 'cash_out'` in insert |
| No wallet table update | `supabase.from('wallets').update({ balance: newBalance })` |

### File changed
- `supabase/functions/process-credit-daily-charges/index.ts` — rewrite wallet interaction logic

No other files or database changes needed.

