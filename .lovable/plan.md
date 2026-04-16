

# Enforce User ↔ Wallet Database Linkage

## Current State (Already in Place)
| Constraint | Status |
|---|---|
| `wallets.id` UUID primary key | ✅ Exists |
| `wallets.user_id → auth.users.id` FK with CASCADE | ✅ Exists |
| `UNIQUE(user_id)` on wallets | ✅ Exists (1 wallet per user) |
| `balance >= 0` check | ✅ Exists |
| `profiles.wallet_id` column | ❌ Does not exist |
| `general_ledger.wallet_id` column | ❌ Does not exist |

All 5,871 profiles already have a matching wallet. The core FK and uniqueness constraints are already solid.

## What Needs to Be Added

### Migration 1: Add `wallet_id` to `general_ledger`
Add a direct `wallet_id` reference so every ledger entry can trace to a specific wallet, not just a user.

```sql
ALTER TABLE public.general_ledger
  ADD COLUMN wallet_id uuid REFERENCES public.wallets(id);

CREATE INDEX idx_general_ledger_wallet_id
  ON public.general_ledger(wallet_id);

-- Backfill existing rows from user_id → wallets lookup
UPDATE public.general_ledger gl
SET wallet_id = w.id
FROM public.wallets w
WHERE w.user_id = gl.user_id
  AND gl.wallet_id IS NULL;
```

### Migration 2: Add `wallet_id` to `profiles` (bidirectional link)
Optional but explicit — allows direct profile-to-wallet resolution without a join through `user_id`.

```sql
ALTER TABLE public.profiles
  ADD COLUMN wallet_id uuid REFERENCES public.wallets(id);

CREATE UNIQUE INDEX idx_profiles_wallet_id
  ON public.profiles(wallet_id);

-- Backfill
UPDATE public.profiles p
SET wallet_id = w.id
FROM public.wallets w
WHERE w.user_id = p.id
  AND p.wallet_id IS NULL;
```

### Migration 3: Update `create_ledger_transaction` RPC
Inside the RPC, auto-resolve `wallet_id` from `user_id` when writing entries:

```sql
-- After extracting user_id from the entry JSON:
SELECT id INTO v_wallet_id
FROM public.wallets
WHERE user_id = v_user_id;

-- Set wallet_id on the inserted ledger row
```

This ensures all future ledger entries automatically carry the wallet link.

## What Is NOT Changed
- No new identity systems — UUID chain preserved
- No balance duplication — balance stays only in `wallets.balance`
- No changes to wallet triggers or RLS policies
- The existing FK, PK, and UNIQUE constraints remain untouched

## Example Resolution Query
```sql
SELECT
  p.id AS user_id,
  p.full_name,
  p.phone,
  w.id AS wallet_id,
  w.balance,
  w.currency
FROM profiles p
JOIN wallets w ON w.user_id = p.id
WHERE p.id = 'some-uuid';
```

## Summary
Three small migrations: two `ADD COLUMN` with backfills, one RPC patch. No schema redesign, no balance duplication, pure enforcement.

