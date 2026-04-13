

## Fix: Approve-Deposit "Transaction Not Balanced" Error

### Problem
The `approve-deposit` edge function is **broken** — every deposit approval fails with:
> "Transaction not balanced. Total cash_in (20000) <> total cash_out (0)"

This is because line 150 in `approve-deposit/index.ts` has **two `cash_in` entries** instead of a balanced pair. The `create_ledger_transaction` RPC requires `SUM(cash_in) == SUM(cash_out)`.

No money is moving from wallets to platform because the ledger rejects the unbalanced transaction.

### Fix (one line change)

**File**: `supabase/functions/approve-deposit/index.ts`, line 150

Change:
```typescript
direction: 'cash_in',  // WRONG — both legs are cash_in
```
To:
```typescript
direction: 'cash_out', // CORRECT — platform takes on liability
```

### Accounting Logic
When a user deposits money into their wallet:
- **User wallet** (wallet scope): `cash_in` — their balance increases
- **Platform** (platform scope): `cash_out` — platform records a liability (it now owes that money back)

This mirrors the inverse of `wallet-deduction` (which correctly uses wallet `cash_out` + platform `cash_in`).

### What This Fixes
- Deposit approvals will work again instantly
- User wallet balances update immediately (via `sync_wallet_from_ledger` trigger)
- "Money We Owe" on CFO dashboard increases in real-time
- "Money We Have" adjusts correctly
- Auto rent repayment, debt clearance, and day pre-payment (downstream steps in the same function) will also resume working

### Deployment
Redeploy the `approve-deposit` edge function after the fix. No database migration needed.

