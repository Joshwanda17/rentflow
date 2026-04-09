

# Phase 2 — Migrate All 33 Edge Functions to `create_ledger_transaction` RPC

## Overview

Replace every direct `.from('general_ledger').insert(...)` call across 33 edge functions with `adminClient.rpc('create_ledger_transaction', { entries: JSON.stringify([...]) })`. This is the single largest safety improvement — it routes all financial writes through the validated gatekeeper.

## Pre-requisite: Migration 0 — Extend RPC

The current `create_ledger_transaction` only inserts: `transaction_group_id`, `user_id`, `ledger_scope`, `direction`, `amount`, `category`, `description`, `reference_id`, `source_table`, `created_at`.

Edge functions also use: `source_id`, `linked_party`, `transaction_date`, `currency`, `account`.

**Add these 5 fields** to the INSERT statement inside the RPC. The user-provided SQL for this is correct and will be used as-is.

## Execution: All 33 Functions in One Deploy

Every function follows the same mechanical pattern:

```text
BEFORE:  await client.from('general_ledger').insert({ ... })
AFTER:   await client.rpc('create_ledger_transaction', { entries: JSON.stringify([...]) })
```

### Key Rules Per Function

1. **One RPC call per business action** — group related inserts into balanced pairs
2. **Complex functions with multiple independent actions** (approve-deposit, approve-wallet-operation) get **separate RPC calls** per sub-action (deposit credit, debt clearance, prepay)
3. **Legacy categories map** to locked categories where possible; otherwise kept as-is (soft mode logs them)
4. **All entries must balance** — `cash_in = cash_out` per RPC call
5. **Remove manual `transaction_group_id` generation** — the RPC returns one automatically

### Category Mapping (Legacy → Locked)

```text
rent_repayment              → tenant_repayment
rent_payment                → tenant_repayment  
debt_clearance              → tenant_repayment
tenant_access_fee           → access_fee_collected
supporter_platform_rewards  → roi_expense / roi_wallet_credit
investment_reinvestment     → roi_reinvestment
agent_bonus                 → agent_commission_earned
platform_expense            → system_balance_correction
advance_repayment           → agent_repayment
wallet_deduction_*          → system_balance_correction
coo_proxy_investment        → partner_funding
pool_capital_received       → partner_funding
rent_float_funding          → rent_disbursement (platform→bridge)
agent_investment_commission → agent_commission_earned
rent_obligation             → rent_receivable_created
pool_rent_deployment        → rent_disbursement
rent_payment_for_tenant     → agent_float_used_for_rent
landlord_rent_payment       → wallet_deposit (landlord receives)
investment_interest         → roi_wallet_credit
cfo_direct_credit/debit     → system_balance_correction
```

### Function-by-Function Changes

#### Batch 1a — Simple (4 functions)

| Function | Current | After |
|----------|---------|-------|
| `wallet-transfer` | 1 insert (2 entries) | 1 RPC call: wallet_transfer wallet↔wallet |
| `wallet-deduction` | 1 insert | 1 RPC call: system_balance_correction wallet→platform |
| `tenant-pay-rent` | 1 insert | 1 RPC call: tenant_repayment wallet→platform |
| `coo-invest-for-partner` | 2 inserts | 1 RPC call: partner_funding wallet→platform |

#### Batch 1b — Medium (7 functions)

| Function | Current | After |
|----------|---------|-------|
| `disburse-rent-to-landlord` | 2 inserts (disbursement + bonus) | 2 RPC calls: rent_disbursement platform→bridge, then agent_commission_earned platform→wallet |
| `process-supporter-roi` | 4 inserts (2 paths) | 1 RPC call per supporter: roi_expense→roi_wallet_credit OR roi_expense→roi_reinvestment |
| `cfo-direct-credit` | 2 inserts (credit or debit) | 1 RPC call: system_balance_correction wallet↔platform |
| `approve-listing-bonus` | 2 inserts | 1 RPC call: agent_commission_earned platform→wallet |
| `credit-landlord-registration-bonus` | 1 insert | 1 RPC call: agent_commission_earned platform→wallet |
| `credit-landlord-verification-bonus` | 1 insert | 1 RPC call: agent_commission_earned platform→wallet |
| `fund-agent-landlord-float` | 3 inserts (float + bonus) | 2 RPC calls: rent_disbursement platform→bridge, then agent_commission_earned platform→wallet |

#### Batch 1c — Complex (3 functions)

| Function | Current | After |
|----------|---------|-------|
| `approve-deposit` | 3 inserts (repayment, debt, prepay) | Up to 3 separate RPC calls per deposit, each balanced |
| `approve-wallet-operation` | 2+ inserts (ledger + commission + investment) | 1 primary RPC + optional commission RPC + optional investment RPC |
| `agent-deposit` | 4+ inserts (agent deduct, tenant credit, landlord credit, repayment) | Multiple RPC calls per business sub-action |

#### Batch 2 — Remaining (19 functions)

| Function | Inserts | After |
|----------|---------|-------|
| `fund-tenants` | 1 | 1 RPC: rent_receivable_created |
| `fund-tenant-from-pool` | 2 | 1 RPC: rent_disbursement + rent_receivable_created |
| `manager-portfolio-topup` | 3 | 1-2 RPC calls per topup |
| `auto-charge-wallets` | 2 | Handled by trigger (sync_collection_to_ledger), agent fallback gets RPC |
| `process-investment-interest` | 1 | 1 RPC: roi_wallet_credit platform→wallet |
| `process-credit-draw` | 1 | 1 RPC: wallet_deposit platform→wallet |
| `process-credit-daily-charges` | 2 | 1-2 RPC calls per charge cycle |
| `process-agent-advance-deductions` | 1 | 1 RPC: agent_repayment wallet→platform |
| `platform-expense-transfer` | 2 | 1 RPC per transfer: system_balance_correction |
| `manual-collect-rent` | 2 | 1-2 RPC calls: tenant_repayment wallet→platform |
| `fund-rent-pool` | 1-2 | 1 RPC: partner_funding |
| `approve-rent-request` | 1 | 1 RPC: rent_receivable_created |
| `portfolio-topup` | 2 | 1 RPC: partner_funding wallet→platform |
| `coo-wallet-to-portfolio` | 1 | 1 RPC: partner_funding wallet→platform |
| `apply-pending-topups` | 1 | 1 RPC per topup |
| `agent-angel-pool-invest` | 3 | 1 RPC: partner_funding |
| `angel-pool-invest` | 1 | 1 RPC: partner_funding |
| `agent-invest-for-partner` | 3 | 1 RPC: partner_funding |
| `retry-no-smartphone-charges` | 1 | 1 RPC: agent_float_used_for_rent |
| `reject-withdrawal` | 2 | 1 RPC: system_balance_correction |
| `seed-test-funds` | 1 | 1 RPC: system_balance_correction |

## Additional Fixes Found During Audit

1. **`fund-tenant-from-pool`** directly updates `wallets.balance` (line 176-181) — violates trigger-only-wallet policy. Will be removed; RPC ledger entry triggers wallet update.
2. **`auto-charge-wallets`** directly updates `wallets.balance` (line 293-294) — same violation. Will be refactored to use ledger insert via RPC.
3. **`approve-wallet-operation` reject path** (line 549-553) directly updates `wallets.balance` — will be replaced with a reversal RPC call.

## What Does NOT Change

- Business logic (validation, role checks, notifications, audit logs)
- `strict_mode` stays `false`
- No data migration
- RPC calls to `record_rent_request_repayment` and `credit_agent_rent_commission` are untouched (they're already controlled)

## Files Changed

| Asset | Type |
|-------|------|
| 1 database migration | Extend `create_ledger_transaction` with 5 missing fields |
| 33 edge functions | Replace direct inserts with RPC calls |

## Risk

- **Soft mode** means any missed category mapping won't break — it logs a NOTICE
- **Balance enforcement** will catch any unbalanced entries immediately (RAISE EXCEPTION)
- All functions deploy atomically — if one fails, the old version stays active for that function

