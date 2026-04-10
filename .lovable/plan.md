

# Fix Plan: Remove `JSON.stringify` from All Ledger RPC Calls

## Problem
32 edge functions still wrap the `entries` parameter in `JSON.stringify()` when calling `create_ledger_transaction`. This turns the array into a scalar string, causing Postgres `jsonb_array_elements()` to fail silently or throw errors. This is the same bug previously fixed in `agent-deposit`, `tenant-pay-rent`, and `approve-wallet-operation`.

## Scope
**55 call sites across 32 edge function files.** Every instance of `entries: JSON.stringify([...])` or `entries: JSON.stringify(someArray)` must become `entries: [...]` or `entries: someArray`.

## Files to Fix (all in `supabase/functions/`)

| # | Edge Function | Sites |
|---|---|---|
| 1 | `agent-angel-pool-invest` | 2 |
| 2 | `agent-invest-for-partner` | 3 |
| 3 | `angel-pool-invest` | 1 |
| 4 | `apply-pending-topups` | 1 |
| 5 | `approve-deposit` | 4 |
| 6 | `approve-listing-bonus` | 1 |
| 7 | `approve-withdrawal` | 1 |
| 8 | `auto-charge-wallets` | 3 |
| 9 | `cfo-direct-credit` | 2 |
| 10 | `coo-invest-for-partner` | 1 |
| 11 | `coo-wallet-to-portfolio` | 1 |
| 12 | `credit-landlord-registration-bonus` | 1 |
| 13 | `credit-landlord-verification-bonus` | 1 |
| 14 | `disburse-rent-to-landlord` | 2 |
| 15 | `fund-agent-landlord-float` | 2 |
| 16 | `fund-rent-pool` | 1 |
| 17 | `fund-tenant-from-pool` | 3 |
| 18 | `fund-tenants` | 1 |
| 19 | `manager-portfolio-topup` | 2 |
| 20 | `manual-collect-rent` | 2 |
| 21 | `platform-expense-transfer` | 2 |
| 22 | `portfolio-topup` | 2 |
| 23 | `process-agent-advance-deductions` | 1 |
| 24 | `process-credit-daily-charges` | 2 |
| 25 | `process-credit-draw` | 1 |
| 26 | `process-investment-interest` | 1 |
| 27 | `process-supporter-roi` | 3 |
| 28 | `reject-withdrawal` | 1 |
| 29 | `retry-no-smartphone-charges` | 1 |
| 30 | `seed-test-funds` | 1 |
| 31 | `wallet-deduction` | 1 |
| 32 | `wallet-transfer` | 1 |

## The Fix (identical for all sites)

```typescript
// BEFORE (broken):
entries: JSON.stringify([{ ... }])

// AFTER (correct):
entries: [{ ... }]
```

For cases using a variable:
```typescript
// BEFORE:
entries: JSON.stringify(buildTenantRepaymentEntries(...))

// AFTER:
entries: buildTenantRepaymentEntries(...)
```

## Deployment
All 32 edge functions will be redeployed after the fix.

## No Database Changes Required
The RPC and triggers are correct — only the callers are passing the wrong type.

## Risk Assessment
- **Low risk**: This is a mechanical find-and-replace of `JSON.stringify(` wrapper removal
- **High impact**: Fixes silent ledger failures across the entire platform — deposits, withdrawals, ROI, commissions, rent disbursements, pool funding, and more

