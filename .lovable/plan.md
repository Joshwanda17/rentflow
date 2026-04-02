

# Pre-Deduct Wallet on Withdrawal Request + Idempotent Refund on Rejection

## Overview

Shift the wallet deduction from final approval to request submission time. On rejection, refund idempotently via ledger. On approval, skip deduction (already done).

## Changes

### 1. Pre-deduct at request time — `src/components/wallet/WithdrawRequestDialog.tsx`

After the successful `withdrawal_requests` insert, immediately insert a `cash_out` ledger entry:

```typescript
// After successful insert, get the new withdrawal ID
const { data: newRow } = await supabase
  .from('withdrawal_requests')
  .select('id')
  .eq('user_id', user.id)
  .eq('amount', amount)
  .eq('status', 'pending')
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

if (newRow) {
  await supabase.from('general_ledger').insert({
    user_id: user.id,
    amount,
    direction: 'cash_out',
    category: 'withdrawal_pending',
    description: `Wallet withdrawal requested – funds held pending approval`,
    transaction_group_id: `wallet-withdraw-${newRow.id}`,
    source_table: 'withdrawal_requests',
    source_id: newRow.id,
    ledger_scope: 'platform',
  } as any);
}
```

The `sync_wallet_from_ledger` trigger will automatically reduce the wallet balance.

### 2. Remove deduction from final approval — `src/components/financial-ops/FinOpsWithdrawalVerification.tsx`

In `handleTidComplete` (lines ~170-179), remove the `cash_out` ledger insert. Replace with a status-only update and audit log — funds were already deducted at request time. Add a `transaction_group_id` reference to link the completion to the original deduction.

### 3. Idempotent refund on rejection — `supabase/functions/reject-withdrawal/index.ts`

**For wallet withdrawals** (lines 99-101), replace the "no refund needed" comment with:

```typescript
if (withdrawal_type !== 'float') {
  const txGroupId = `wallet-reject-${wId}`;
  const { data: existing } = await admin
    .from('general_ledger')
    .select('id')
    .eq('transaction_group_id', txGroupId)
    .limit(1);

  if (!existing || existing.length === 0) {
    await admin.from('general_ledger').insert({
      user_id: userId,
      amount: wr.amount,
      direction: 'cash_in',
      category: 'withdrawal_reversal',
      description: `Wallet withdrawal rejected – funds restored. Reason: ${reason.substring(0, 100)}`,
      transaction_date: new Date().toISOString(),
      transaction_group_id: txGroupId,
      source_table: 'withdrawal_requests',
      source_id: wId,
      ledger_scope: 'platform',
    });
  }
  refunded = true;
}
```

**For float withdrawals** (lines 86-97), wrap the existing refund with the same idempotency guard:

```typescript
const floatTxGroupId = `float-reject-${wId}`;
const { data: existingFloat } = await admin
  .from('general_ledger')
  .select('id')
  .eq('transaction_group_id', floatTxGroupId)
  .limit(1);

if (!existingFloat || existingFloat.length === 0) {
  // existing float restore logic + ledger insert
}
```

### 4. Fix `.catch()` on Supabase insert — `supabase/functions/reject-withdrawal/index.ts`

Replace line 150 (`.catch(() => {})` chained on insert) with a try/catch:

```typescript
try {
  await admin.from('notifications').insert({...});
} catch { /* notification suppressed by trigger */ }
```

## Files Modified

- `src/components/wallet/WithdrawRequestDialog.tsx` — add `cash_out` ledger entry after insert
- `src/components/financial-ops/FinOpsWithdrawalVerification.tsx` — remove `cash_out` ledger entry from final approval
- `supabase/functions/reject-withdrawal/index.ts` — add idempotent wallet refund, float idempotency guard, fix `.catch()`

## Guarantees

- **No double deductions**: Single `cash_out` at request time with unique `transaction_group_id`
- **No double refunds**: Existence check on `transaction_group_id` before inserting reversal
- **Ledger traceable**: Every wallet change tied to a ledger entry
- **Safe retries**: Edge function re-runs skip already-processed refunds

