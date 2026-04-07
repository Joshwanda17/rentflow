

## Fix: Double-Deduction Bug in Agent-Deposit Function

### Root Cause

The `agent-deposit` edge function has the **same class of bug** as the `approve-deposit` function we already fixed. It manually deducts the agent's wallet balance **and** inserts a `cash_out` ledger entry. Since the `sync_wallet_from_ledger` trigger now fires on ALL ledger inserts, the wallet gets deducted twice:

1. **Manual deduction** (line 403-410): `balance = balance - amount`
2. **Trigger deduction** (line 420-431): ledger `cash_out` insert → trigger fires → deducts again

This is why 50k became 100k and 10k became 20k for Onesmus. The 30k payment likely hit a race condition or was the first to process before the wallet state diverged.

Additionally, `creditWalletDirect()` (line 16-40) manually credits wallets before ledger entries are inserted, causing potential double-credits on the receiving side (landlord, tenant).

### Fix (2 parts)

**Part 1 — Code fix in `agent-deposit/index.ts`:**

Remove all manual wallet balance manipulation. Let the `sync_wallet_from_ledger` trigger handle balance changes exclusively:

- **Lines 403-418**: Remove manual `wallet.update({ balance: newAgentBalance })` block. Keep only the ledger insert (lines 420-431) which triggers the automatic deduction.
- **Lines 516-531**: Same removal for the `repaymentAmount === 0` branch.
- **`creditWalletDirect()` function**: Replace with a simple "ensure wallet exists" upsert (like the fix in `approve-deposit`). The subsequent ledger `cash_in` inserts will handle the actual credit via trigger.

**Part 2 — Data correction for Onesmus:**

The excess deductions are:
- 50k overpaid (should have been 50k, was 100k)
- 10k overpaid (should have been 10k, was 20k)
- **Total excess: 60k** deducted from Onesmus's agent wallet

Correction via database migration:
- Insert a `cash_in` ledger entry of 60k for Onesmus (category: `balance_correction`, description: "Reversal of double-deduction from agent-deposit bug")
- The `sync_wallet_from_ledger` trigger will automatically restore 60k to his wallet
- Insert audit log entry documenting the correction

### Risk Assessment
- Low risk: same pattern as the already-proven `approve-deposit` fix
- The trigger chain is the single-writer for wallet balances — all other manual writes must be removed

