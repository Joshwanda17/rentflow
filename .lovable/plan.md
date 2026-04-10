

# Refactor product-purchase and agent-withdrawal to Ledger-First Architecture

## Summary

Remove all direct wallet mutations from the two remaining anti-pattern edge functions and route all money movement through `create_ledger_transaction` RPC. This completes the migration to a fully ledger-first system where `sync_wallet_from_ledger` is the sole wallet writer.

## Changes

### 1. `supabase/functions/product-purchase/index.ts` -- Full rewrite of financial logic

**Remove** (lines 112-248): All four direct wallet `.update({ balance })` calls, the manual rollback logic, and the separate cashback wallet read+update.

**Replace with** a single `create_ledger_transaction` RPC call containing all legs in one `entries[]` array:

```text
Leg 1: buyer   wallet   cash_out  wallet_deduction   totalPrice
Leg 2: agent   wallet   cash_in   agent_commission_earned  totalPrice (agent receives full sale amount)
Leg 3: platform platform cash_in  access_fee_collected  agentCommission (1% platform fee)
Leg 4: platform platform cash_out access_fee_collected  agentCommission (offset -- net zero for now, or use as revenue)
```

If cashback applies (verified agent, 4%):
```text
Leg 5: buyer   wallet   cash_in   wallet_transfer   cashbackAmount
Leg 6: platform platform cash_out wallet_transfer   cashbackAmount
```

All legs share one `transaction_group_id` -- atomic, balanced, auditable. If the RPC fails, nothing moves. No rollback logic needed.

**Keep**: Product validation, stock check, discount calc, order record insert, agent_earnings insert, notifications, push notifications.

**Balance check**: Read ledger-derived balance (from `wallets` table which is trigger-synced) before calling RPC. The RPC itself also enforces wallet-scope cash_out balance checks.

### 2. `supabase/functions/agent-withdrawal/index.ts` -- Replace wallet mutation with RPC

**Remove** (lines 158-180): The direct `.update({ balance })` with optimistic locking.

**Replace with** a single `create_ledger_transaction` RPC call:

```text
Leg 1: targetUser  wallet   cash_out  wallet_withdrawal  amount
Leg 2: (no user)   platform cash_out  wallet_withdrawal  amount
```

This is a balanced withdrawal -- money leaves both the user's wallet scope and the platform scope.

**Keep**: All validation (auth, agent role check, user lookup by phone, balance check), withdrawal record insert, profile fetch for response, notifications.

**Response**: After RPC succeeds, re-read the wallet balance (now updated by trigger) for the response `new_balance` field.

### 3. `src/lib/ledgerConstants.ts` -- Add pending_portfolio_topup

Add `'pending_portfolio_topup'` to the `LOCKED_CATEGORIES` array under a new "Portfolio" comment section. This unblocks the mid-cycle top-up parking flow discussed earlier.

## What does NOT change

- No database migrations
- No new tables
- No RPC changes (existing `create_ledger_transaction` handles everything)
- No client-side changes
- Stock updates, order records, earnings records, notifications all remain as-is

## End state after this change

Zero direct wallet mutations remain in the entire codebase. Every financial operation follows:

```text
Client -> Edge Function (validation) -> create_ledger_transaction RPC -> general_ledger -> sync_wallet_from_ledger
```

