

# Final Batch — Migrate Remaining 9 Edge Functions to RPC

## Summary

Replace all remaining direct `.from('general_ledger').insert(...)` calls and remove direct `wallets.balance` mutations across 9 functions. No new locked categories needed — all user-specified categories map to existing ones.

## Category Corrections (User Spec → Locked Categories)

The user's spec used some categories not in the locked list. Mapping to existing locked categories:

```text
User said "operations_expense"  → partner_funding (money going to user wallet)
User said "operations_funding"  → partner_funding (wallet → platform)
User said "wallet_transfer"     → partner_funding (portfolio context, not peer transfer)
```

All portfolio-related flows use `partner_funding` as the locked category since that's what these are — capital movements between wallet and platform for investment purposes.

## Function-by-Function Changes

### 1. `fund-tenants` (lines 262-274)
- **Current:** 1 direct insert (`rent_obligation`, `cash_out`)
- **Replace with RPC:** `platform/cash_out/rent_disbursement` + `bridge/cash_in/rent_receivable_created`
- Tenant obligation is a receivable, not a wallet operation

### 2. `fund-tenant-from-pool` (lines 206-234)
- **Current:** 2 direct inserts (`pool_rent_deployment` + `rent_obligation`) + direct `wallets.update` (lines 174-186 landlord, lines 309-317 agent bonus)
- **Replace with:** 1 RPC: `platform/cash_out/rent_disbursement` + `bridge/cash_in/rent_receivable_created`
- **Landlord credit:** Separate RPC: `platform/cash_out/wallet_deposit` + `wallet/cash_in/wallet_deposit` (replaces direct wallet mutation)
- **Agent bonus (lines 309-317):** Separate RPC: `platform/cash_out/agent_commission_earned` + `wallet/cash_in/agent_commission_earned` (replaces direct wallet mutation)
- **Remove:** Direct `wallets.update` at lines 174-186 and 309-317

### 3. `auto-charge-wallets` (lines 670-705)
- **Current:** 2 direct inserts (`agent_liability` + `agent_commission_used_for_rent`) + direct `wallets.update` (lines 291-294, 404-406)
- **Agent liability (line 670):** Replace with RPC: `wallet/cash_out/system_balance_correction` + `platform/cash_in/system_balance_correction`
- **Commission charge (line 693):** Replace with RPC: `wallet/cash_out/agent_commission_used_for_rent` + `platform/cash_in/agent_commission_used_for_rent`
- **Remove:** Direct `wallets.update` at lines 291-294 and 404-406. Wallet deductions will be driven by `subscription_charge_logs` trigger + RPC ledger entries

### 4. `fund-rent-pool` (lines 135-147)
- **Current:** 1 direct insert (`supporter_rent_fund`, `cash_out`)
- **Replace with RPC:** `wallet/cash_out/partner_funding` + `platform/cash_in/partner_funding`

### 5. `agent-invest-for-partner` (lines 102-235)
- **Current:** 3 direct inserts + `general_ledger.delete()` rollback calls
- **Agent deduction (line 102):** RPC: `wallet/cash_out/partner_funding` + `platform/cash_in/partner_funding`
- **Partner credit (line 195):** RPC: `platform/cash_out/partner_funding` + `wallet/cash_in/partner_funding`
- **Partner debit to portfolio (line 217):** RPC: `wallet/cash_out/partner_funding` + `platform/cash_in/partner_funding`
- **Remove:** All `general_ledger.delete()` rollback calls (lines 185, 212) — RPC handles atomicity

### 6. `manager-portfolio-topup` (lines 147-278)
- **Wallet path (line 147):** RPC: `wallet/cash_out/partner_funding` + `platform/cash_in/partner_funding`
- **Reversal (line 190):** RPC: `platform/cash_out/system_balance_correction` + `wallet/cash_in/system_balance_correction`
- **Non-wallet path (line 251):** RPC: `wallet/cash_out/partner_funding` + `platform/cash_in/partner_funding`

### 7. `coo-wallet-to-portfolio` (lines 130-157)
- **Current:** 1 array insert of 2 entries (wallet `cash_out` + platform `credit`)
- **Replace with RPC:** `wallet/cash_out/partner_funding` + `platform/cash_in/partner_funding`

### 8. `portfolio-topup` (lines 131-158, 176-188)
- **Main (line 131):** RPC: `wallet/cash_out/partner_funding` + `platform/cash_in/partner_funding`
- **Reversal (line 176):** RPC: `platform/cash_out/system_balance_correction` + `wallet/cash_in/system_balance_correction`

### 9. `apply-pending-topups` (lines 138-152)
- **Current:** 1 insert with `credit` direction (will be normalized by RPC guard)
- **Replace with RPC:** `platform/cash_out/partner_funding` + `wallet/cash_in/partner_funding`

## Direct Wallet Mutations to Remove

| Function | Lines | Current Code |
|----------|-------|-------------|
| `fund-tenant-from-pool` | 174-186 | `wallets.update/insert` for landlord credit |
| `fund-tenant-from-pool` | 309-317 | `wallets.update` for agent bonus |
| `auto-charge-wallets` | 291-294 | `wallets.update({ balance: newBalance })` tenant deduction |
| `auto-charge-wallets` | 404-406 | `wallets.update({ balance: newBalance })` partial deduction |

Note: `auto-charge-wallets` tenant deductions at lines 291-294 and 404-406 are tricky — they feed into `subscription_charge_logs` which has its own trigger (`sync_collection_to_ledger`). The wallet deduction there IS the source event. We need to replace it with a ledger insert via RPC, then let the trigger sync the wallet.

## Files Changed

| Asset | Count |
|-------|-------|
| 9 edge functions | Replace direct inserts + remove wallet mutations |
| 0 migrations | No new categories needed |
| 0 frontend changes | None |

## Safety
- `strict_mode` stays `false`
- Direction normalization in RPC catches any remaining `credit`/`debit`
- Wallet overdraft guard blocks negative balances at DB level
- All `general_ledger.delete()` calls removed — RPC is atomic

