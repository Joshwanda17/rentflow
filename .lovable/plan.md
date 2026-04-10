

# Fix Deposit Flow: Drop Rogue Trigger, Add Ledger-First Credit

## Problem

The `trg_deposit_to_ledger` trigger fires when `deposit_requests.status` changes to `'approved'` and directly inserts a **single-sided** ledger entry:

- Category `'deposit'` (not in the `LOCKED_CATEGORIES` allowlist — should be `'wallet_deposit'`)
- No `transaction_group_id` — not balanced
- No platform-side counterpart — breaks the Golden Rule (`Cash = Wallet + Platform`)
- Bypasses `create_ledger_transaction` RPC entirely
- Sets `ledger.authorized = true` to slip past the Layer 4 guard

The edge function then reads `wallets.balance` for auto-deductions, but the trigger-driven credit may not have synced yet — a race condition.

## Figures Affected

| Figure | Impact |
|---|---|
| `wallets.balance` | Inflated — credited by rogue trigger without balanced ledger entry |
| Platform cash position | Understated — no matching `platform / cash_in / wallet_deposit` entry |
| Treasury liquidity ratio | Skewed — inflows not reflected on platform side |
| CFO Income Statement | Missing deposit inflow data (wrong category filtered out) |
| Reconciliation reports | Permanent drift — every approved deposit adds to the gap |

## Plan

### Step 1 — Migration: Drop the rogue trigger

```sql
DROP TRIGGER IF EXISTS trg_deposit_to_ledger ON public.deposit_requests;
DROP FUNCTION IF EXISTS public.log_deposit_to_ledger();
```

This stops uncontrolled money creation. The `sync_wallet_from_ledger` trigger remains — it will credit wallets when the RPC writes a proper entry.

### Step 2 — Update `approve-deposit` edge function

Insert a balanced double-entry **before** any auto-deductions, using the `create_ledger_transaction` RPC:

```
wallet   / cash_in  / wallet_deposit  (user receives funds)
platform / cash_in  / wallet_deposit  (platform records inflow)
```

Specifically, after the status update to `'approved'` and wallet upsert (lines 122-131), add:

```typescript
const { error: depositLedgerErr } = await supabaseAdmin.rpc('create_ledger_transaction', {
  entries: JSON.stringify([
    {
      user_id: depositRequest.user_id,
      amount: depositRequest.amount,
      direction: 'cash_in',
      category: 'wallet_deposit',
      ledger_scope: 'wallet',
      source_table: 'deposit_requests',
      source_id: depositRequest.id,
      reference_id: depositRequest.transaction_id || depositRequest.id,
      description: `Wallet deposit via ${depositRequest.provider || 'mobile money'}`,
      currency: 'UGX',
      transaction_date: new Date().toISOString(),
    },
    {
      direction: 'cash_in',
      amount: depositRequest.amount,
      category: 'wallet_deposit',
      ledger_scope: 'platform',
      source_table: 'deposit_requests',
      source_id: depositRequest.id,
      description: 'Platform records deposit inflow',
      currency: 'UGX',
      transaction_date: new Date().toISOString(),
    },
  ]),
});

if (depositLedgerErr) {
  throw new Error(`Deposit ledger entry failed: ${depositLedgerErr.message}`);
}
```

This call is **atomic** — if it fails, no wallet credit occurs and the deposit can be retried. The `sync_wallet_from_ledger` trigger automatically updates `wallets.balance`.

### Step 3 — Remove stale wallet re-reads

The current code re-reads `wallets.balance` multiple times (lines 142-148, 244-248, 317-320) between deduction steps. After the RPC-based credit, the wallet is already synced by the trigger. The first re-read after the RPC call is sufficient; subsequent re-reads after each deduction RPC remain valid since those RPCs also trigger wallet sync.

No change needed here — the existing re-reads become correct once the initial credit is ledger-driven.

### Step 4 — Deploy and verify

1. Deploy the migration (drops trigger)
2. Deploy the updated `approve-deposit` edge function
3. Test: approve a deposit → verify two ledger entries created with matching `transaction_group_id`, correct category `wallet_deposit`, and wallet balance updated

### What stays the same

- Auto-deductions (rent repayment, debt clearance, prepay) — already use `create_ledger_transaction` RPC correctly
- Agent commission credits — already use `credit_agent_rent_commission` RPC
- Rejection flow — no ledger entry needed (no money moves)
- `sync_wallet_from_ledger` trigger — continues to be the sole wallet writer

### Files changed

1. **New migration** — drops `trg_deposit_to_ledger` and `log_deposit_to_ledger()`
2. **`supabase/functions/approve-deposit/index.ts`** — adds `create_ledger_transaction` RPC call after status update, before auto-deductions

