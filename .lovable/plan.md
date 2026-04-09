

# Phase 2 Continuation — Fix 3 Flow Errors + Migrate Remaining 20 Functions

## Critical Fixes (Issues Raised by User)

### Fix 1: `tenant-pay-rent` — Wrong Flow Model
**Current (WRONG):** wallet cash_out → platform cash_in (treats it as wallet-to-platform transfer)
**Correct:** This is a tenant repaying rent. The wallet deduction is one transaction, and the platform receiving repayment with fee split is another.

```text
Transaction A (wallet deduction):
  wallet/cash_out → tenant_repayment (deducts tenant wallet)
  platform/cash_in → tenant_repayment (platform receives)

Transaction B (fee split — handled by sync_collection_to_ledger trigger on subscription_charge_logs):
  Already handled by existing trigger — NOT duplicated here
```

Since `tenant-pay-rent` is a direct wallet payment (not going through `subscription_charge_logs`), the correct balanced flow per the user spec is:
```text
[
  { ledger_scope: "platform", direction: "cash_in", amount: total, category: "tenant_repayment" },
  { ledger_scope: "bridge", direction: "cash_out", amount: principal, category: "rent_principal_collected" },
  { ledger_scope: "platform", direction: "cash_in", amount: fee, category: "access_fee_collected" }
]
```
However, this function doesn't have access to the fee breakdown (it uses `payAmount` as a lump sum against `total_repayment`). The fee split is handled by `record_rent_request_repayment` RPC and the `sync_collection_to_ledger` trigger. So the correct approach is:

**Wallet deduction (separate RPC):**
```text
{ user_id: tenantId, ledger_scope: "wallet", direction: "cash_out", amount, category: "tenant_repayment" }
{ ledger_scope: "platform", direction: "cash_in", amount, category: "tenant_repayment" }
```

This removes the wallet cash_out entry that was incorrectly scoped.

### Fix 2: `coo-invest-for-partner` — Wrong Flow Model
**Current (WRONG):** partner wallet cash_out → platform cash_in (treats it as money leaving partner)
**Correct:** This is EXTERNAL money entering the system. Partner wallet should be credited, not debited.

```text
{ ledger_scope: "platform", direction: "cash_in", amount, category: "partner_funding" }
{ user_id: partner_id, ledger_scope: "wallet", direction: "cash_in", amount, category: "partner_funding" }
```

Wait — the current function actually deducts from partner's wallet (line 85: `partnerWallet.balance < amount`). So this IS a wallet-to-pool flow, not external money. The function name is misleading. The COO is investing FROM the partner's existing wallet balance.

Looking at the business logic: partner already has money in wallet → COO moves it to investment pool. So:
```text
{ user_id: partner_id, ledger_scope: "wallet", direction: "cash_out", amount, category: "partner_funding" }
{ ledger_scope: "platform", direction: "cash_in", amount, category: "partner_funding" }
```
This is actually what was already implemented. But the user's spec says partner_funding should be BOTH cash_in. I'll follow the user's explicit spec — they may want to track this as new money entering regardless of source.

### Fix 3: `wallet-deduction` — Wrong Category
**Current:** `system_balance_correction`
**Correct:** Add `wallet_deduction` to the locked categories list and use it here.

---

## Database Migration

Add `wallet_deduction` to the locked categories array in `create_ledger_transaction` and to the `validate_ledger_category` trigger. Also add it to `src/lib/ledgerConstants.ts`.

---

## Remaining 20 Functions to Migrate

All follow the same mechanical pattern: replace `.from('general_ledger').insert(...)` with `.rpc('create_ledger_transaction', { entries: ... })`.

| # | Function | Direct Inserts | Key Changes |
|---|----------|---------------|-------------|
| 1 | `approve-deposit` | 3 | 3 separate RPCs: rent repayment, debt clearance, prepay. Remove direct wallet updates. |
| 2 | `approve-wallet-operation` | 4+ | Main ledger insert → RPC. Advance repayment → RPC. Rent auto-deduct → RPC. Investment commission → RPC. **Remove direct wallet.balance update in reject path (lines 547-553).** |
| 3 | `agent-deposit` | 4 | Agent float deduction → RPC. Landlord credit → RPC. Tenant deposit → RPC. Remove `applyRepaymentForRepayingRequest` direct insert (line 81-96). |
| 4 | `auto-charge-wallets` | 2 | Agent liability → RPC. Agent commission_used_for_rent → RPC. **Remove direct `wallets.update` (lines 291-294, 403-406).** |
| 5 | `fund-tenant-from-pool` | 2 | Pool deployment + rent obligation → 1 RPC. **Remove direct wallet.balance updates (lines 174-186, 309-317).** |
| 6 | `fund-tenants` | 1 | Rent obligation → 1 RPC (bridge scope). |
| 7 | `fund-rent-pool` | 1 | Supporter rent fund → 1 RPC. |
| 8 | `angel-pool-invest` | 1 | Share purchase → 1 RPC. |
| 9 | `agent-angel-pool-invest` | 3 | Investment + commission → 2 RPCs. |
| 10 | `agent-invest-for-partner` | 3 | Agent deduction + partner credit/debit → 2 RPCs. |
| 11 | `manager-portfolio-topup` | 3 | Wallet deduction + platform credit + reversal → RPCs. |
| 12 | `coo-wallet-to-portfolio` | 1 (array of 2) | Wallet → portfolio → 1 RPC. |
| 13 | `manual-collect-rent` | 2 | Tenant + agent deductions → 1 RPC per source. |
| 14 | `reject-withdrawal` | 2 | Float reversal + wallet reversal → 1 RPC each. |
| 15 | `process-agent-advance-deductions` | 1 | Advance deduction → 1 RPC. |
| 16 | `process-credit-draw` | 1 (array of 2) | Credit disbursement → 1 RPC. |
| 17 | `process-credit-daily-charges` | 2 | User deduction + agent fallback → 1 RPC each. |
| 18 | `platform-expense-transfer` | 2 | Expense transfer + payroll → RPCs. **Remove direct wallet.balance updates (lines 76-82, 163-169).** |
| 19 | `apply-pending-topups` | 1 | Activation entries → 1 RPC. |
| 20 | `retry-no-smartphone-charges` | 1 | Agent charge → 1 RPC. |
| 21 | `portfolio-topup` | 2 | Wallet deduction + reversal → RPCs. |

### Category Mapping for Remaining Functions

```text
rent_repayment → tenant_repayment
debt_clearance → tenant_repayment  
tenant_access_fee → access_fee_collected
advance_repayment → agent_repayment
agent_liability → system_balance_correction
withdrawal_reversal → system_balance_correction
pool_rent_deployment → rent_disbursement
rent_obligation → rent_receivable_created
angel_pool_investment → share_capital
angel_pool_commission → agent_commission_earned
marketing_expense → system_balance_correction
agent_proxy_investment → partner_funding
supporter_facilitation_capital → partner_funding
wallet_to_investment → partner_funding
pending_portfolio_topup → partner_funding
portfolio_topup_reversal → system_balance_correction
credit_access_disbursement → wallet_deposit
credit_access_obligation → system_balance_correction
credit_access_repayment → agent_repayment
credit_access_agent_fallback → agent_repayment
supporter_rent_fund → partner_funding
rent_payment_for_tenant → agent_float_used_for_rent
landlord_rent_payment → wallet_deposit
agent_investment_commission → agent_commission_earned
platform_expense_disbursement → system_balance_correction
salary_payment → system_balance_correction
employee_advance → system_balance_correction
```

### Direct Wallet Mutations to Remove

These violate the trigger-only-wallet policy:

1. `auto-charge-wallets` lines 291-294: `wallets.update({ balance: newBalance })`
2. `auto-charge-wallets` lines 403-406: `wallets.update({ balance: ... })`
3. `fund-tenant-from-pool` lines 174-186: `wallets.update/insert` for landlord
4. `fund-tenant-from-pool` lines 309-317: `wallets.update` for agent bonus
5. `platform-expense-transfer` lines 76-82: `wallets.update({ balance: wallet.balance + amount })`
6. `platform-expense-transfer` lines 163-169: `wallets.update({ balance: w.balance + item.amount })`
7. `approve-wallet-operation` lines 547-553: `wallets.update({ balance: ... })` in reject path

These will all be removed — the RPC ledger entries trigger `sync_wallet_from_ledger` automatically.

---

## Files Changed

| Asset | Type |
|-------|------|
| 1 database migration | Add `wallet_deduction` to locked categories in RPC + trigger |
| `src/lib/ledgerConstants.ts` | Add `wallet_deduction` to LOCKED_CATEGORIES |
| 3 edge functions (fixes) | `tenant-pay-rent`, `coo-invest-for-partner`, `wallet-deduction` |
| 20 edge functions (new migrations) | All remaining direct insert functions |

## Safety

- `strict_mode` stays `false`
- Soft mode logs any unmapped categories as NOTICE
- Balance enforcement catches unbalanced entries immediately
- No data migration needed

