

# Reconcile 4 Drifted Wallets + Add Wallet Mutation Guard

## Current Drift State (Confirmed)

| User | Wallet | Ledger | Drift | Fix |
|------|--------|--------|-------|-----|
| MUSEMA KIZITO | 1,100,000 | 0 | +1.1M | Zero the wallet via correction entry |
| Mercy Bayo | 600,000 | 0 | +600K | Zero the wallet via correction entry |
| NAMULINDWA IMMECULATE | 75,000 | 0 | +75K | Zero the wallet via correction entry |
| HELLEN NABUKENYA | 0 | 5,000 | -5K | Credit wallet to 5K via correction entry |

## Migration 1: Correction Ledger Entries

For the 3 users with inflated wallets (ledger = 0, wallet > 0), insert balanced `system_balance_correction` entries:
- **wallet scope, cash_out** for the inflated amount (drains the wallet via `sync_wallet_from_ledger`)
- **platform scope, cash_in** for the same amount (platform absorbs the phantom funds)

For Hellen (ledger = 5K, wallet = 0):
- **wallet scope, cash_in** for 5K (credits the wallet to match ledger truth)
- **platform scope, cash_out** for 5K (platform funds the correction)

All entries use `system_balance_correction` category, a shared `transaction_group_id`, descriptive audit text, and reference IDs like `COR260410XXXX`.

After the ledger entries, `sync_wallet_from_ledger` will automatically adjust wallet balances. However, because the trigger uses `GREATEST(balance - amount, 0)` clamping, we need a final force-reconcile for Hellen whose wallet is already at 0 (the cash_in will correctly add 5K — no issue there). For the 3 inflated users, the cash_out entries will drain their ballets correctly.

## Migration 2: Wallet Mutation Guard

The `sync_wallet_from_ledger` trigger updates wallets directly — so a naive "block all updates" trigger would break the system. Instead, we use the same session-variable pattern as the ledger fortress:

```sql
CREATE OR REPLACE FUNCTION public.guard_wallet_direct_update()
RETURNS trigger AS $$
BEGIN
  -- Allow sync_wallet_from_ledger (sets this flag)
  IF current_setting('wallet.sync_authorized', true) = 'true' THEN
    RETURN NEW;
  END IF;
  
  -- Allow if balance hasn't changed
  IF OLD.balance IS NOT DISTINCT FROM NEW.balance THEN
    RETURN NEW;
  END IF;
  
  RAISE EXCEPTION 'Direct wallet balance mutation forbidden. All balance changes must go through the ledger.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_wallet_mutation
BEFORE UPDATE ON wallets
FOR EACH ROW
EXECUTE FUNCTION guard_wallet_direct_update();
```

Then update `sync_wallet_from_ledger` to set `wallet.sync_authorized = 'true'` before its UPDATE calls.

## Migration 3: Audit the partner_funding code path

No code changes needed — `fund-rent-pool/index.ts` already uses `create_ledger_transaction` RPC exclusively. It never writes to `wallets.balance` directly. The drift was caused by **legacy rogue triggers** (now dropped), not by the current code.

## Summary of Changes

**Database (2 migrations):**
1. Insert 8 correction ledger entries (4 users × 2 entries each) to reconcile drift
2. Add `guard_wallet_direct_update` trigger + update `sync_wallet_from_ledger` to use session flag

**No UI or Edge Function changes needed.**

## Technical Detail

The session-variable approach (`wallet.sync_authorized`) mirrors the existing `ledger.authorized` pattern used in the ledger fortress. This ensures only the sanctioned `sync_wallet_from_ledger` trigger can modify `wallets.balance`, while all other UPDATE attempts that change the balance column are blocked with a clear error.

