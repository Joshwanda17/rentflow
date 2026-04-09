

# Phase 2 Continuation — RPC Hardening + Remaining 20 Function Migrations

## Part A: RPC Hardening (4 Non-Negotiable Guards)

### 1. Direction Normalization
Add to the validation loop in `create_ledger_transaction`, before the direction check:
```sql
IF entry->>'direction' IN ('credit','in') THEN
  entry := jsonb_set(entry, '{direction}', '"cash_in"');
ELSIF entry->>'direction' IN ('debit','out') THEN
  entry := jsonb_set(entry, '{direction}', '"cash_out"');
END IF;
```
This catches legacy `credit`/`debit`/`in`/`out` from functions not yet migrated or from old data.

### 2. Transaction Group ID Guard
Already guaranteed — `group_id` is generated as `gen_random_uuid()` at the top of the function. It can never be NULL. No additional guard needed.

### 3. Wallet Negative Balance Guard
Add after the balance check loop, inside PASS 2 before each INSERT:
```sql
IF entry->>'ledger_scope' = 'wallet' AND entry->>'direction' = 'cash_out' THEN
  PERFORM 1 FROM (
    SELECT COALESCE(SUM(CASE WHEN direction='cash_in' THEN amount ELSE -amount END), 0) AS bal
    FROM general_ledger
    WHERE user_id = (entry->>'user_id')::UUID AND ledger_scope = 'wallet'
  ) t WHERE t.bal < (entry->>'amount')::NUMERIC;
  IF FOUND THEN
    RAISE EXCEPTION 'Insufficient wallet balance for user %', entry->>'user_id';
  END IF;
END IF;
```

### 4. Audit Log
Add before the RETURN:
```sql
INSERT INTO audit_logs (user_id, action_type, metadata, created_at)
VALUES (NULL, 'ledger_transaction', jsonb_build_object('group_id', group_id, 'entry_count', jsonb_array_length(entries), 'total_amount', total_in), NOW());
```

## Part B: Remaining 20 Edge Functions

Each function replaces `.from('general_ledger').insert(...)` with `.rpc('create_ledger_transaction', { entries: ... })`. Direct `wallets.balance` mutations are removed.

### Function-by-Function Corrections

| # | Function | Direct Inserts | Correct Flow | Key Notes |
|---|----------|---------------|-------------|-----------|
| 1 | `auto-charge-wallets` | 2 (lines 670-682, 693-705) | **chargeAgent**: liability entry → RPC balanced pair (wallet cash_out + platform cash_in as `agent_commission_used_for_rent`). **Remove direct `wallets.update`** at lines 291-294, 404-406. Tenant wallet deduction handled by `subscription_charge_logs` trigger — no ledger insert needed. |
| 2 | `fund-tenants` | 1 (line 262-274) | Replace with RPC: `bridge/cash_in/rent_receivable_created` + `platform/cash_out/rent_disbursement`. This is a receivable creation, not a wallet operation. |
| 3 | `fund-tenant-from-pool` | 2 (lines 206-218, 222-234) | Replace with RPC: `platform/cash_out/rent_disbursement` + `bridge/cash_in/rent_receivable_created`. **Remove direct `wallets.update`** at lines 174-186 (landlord) and 309-317 (agent bonus). Agent bonus → separate RPC: `platform/cash_out + wallet/cash_in` as `agent_commission_earned`. |
| 4 | `manual-collect-rent` | 2 (lines 160-172, 207-220) | Replace with RPC per source. Tenant: `wallet/cash_out/tenant_repayment` + `platform/cash_in/tenant_repayment`. Agent: same pattern. Each source = separate balanced RPC call. |
| 5 | `process-credit-daily-charges` | 2 (lines 103-114, 120-131) | Per user's correction: this is accrual, NOT cash. Replace with RPC: `bridge/cash_in/rent_receivable_created` as a single balanced entry pair. User deduction = `wallet/cash_out` + `platform/cash_in` as `agent_repayment`. Agent fallback = same. |
| 6 | `reject-withdrawal` | 2 (lines 106-116, 134-147) | Per user's correction: **NO ledger entry**. Rejection means nothing moved financially. Remove all `general_ledger.insert` calls. The original withdrawal request's ledger entry (if any) should NOT be reversed — the withdrawal was never approved. |
| 7 | `process-investment-interest` | 1 (lines 94-104) | Replace with RPC: `platform/cash_out/roi_expense` + `wallet/cash_in/roi_wallet_credit`. Must enforce ROI flow rules. |
| 8 | `process-agent-advance-deductions` | 1 (lines 112-123) | Replace with RPC: `wallet/cash_out/agent_repayment` + `platform/cash_in/agent_repayment`. |
| 9 | `fund-rent-pool` | 1 (lines 135-147) | Replace with RPC: `wallet/cash_out/partner_funding` + `platform/cash_in/partner_funding`. Supporter sends money to pool. |
| 10 | `angel-pool-invest` | 1 (lines 102-114) | Replace with RPC: `wallet/cash_out/share_capital` + `platform/cash_in/share_capital`. |
| 11 | `agent-angel-pool-invest` | 3 (lines 129-141, 169-181, 186-201) | Investment: RPC `wallet/cash_out/share_capital` + `platform/cash_in/share_capital`. Commission: separate RPC `platform/cash_out/agent_commission_earned` + `wallet/cash_in/agent_commission_earned`. |
| 12 | `agent-invest-for-partner` | 3 (lines 102-113, 195-207, 217-235) | Agent deduction: RPC `wallet/cash_out/partner_funding` + `platform/cash_in/partner_funding`. Partner credit+debit (net-zero pass-through): RPC `platform/cash_out/partner_funding` + `wallet/cash_in/partner_funding`, then `wallet/cash_out/partner_funding` + `platform/cash_in/partner_funding`. |
| 13 | `manager-portfolio-topup` | 3 (lines 147-174, 190-202, 251-278) | Wallet path: RPC `wallet/cash_out/partner_funding` + `platform/cash_in/partner_funding`. Reversal: RPC `wallet/cash_in/system_balance_correction` + `platform/cash_out/system_balance_correction`. Non-wallet path: same pattern. |
| 14 | `coo-wallet-to-portfolio` | 1 array of 2 (lines 130-157) | Replace with RPC: `wallet/cash_out/partner_funding` + `platform/cash_in/partner_funding`. |
| 15 | `portfolio-topup` | 2 (lines 131-158, 176-188) | Main: RPC `wallet/cash_out/partner_funding` + `platform/cash_in/partner_funding`. Reversal: RPC `wallet/cash_in/system_balance_correction` + `platform/cash_out/system_balance_correction`. |
| 16 | `process-credit-draw` | 1 array of 2 (lines 102-128) | Replace with RPC: `platform/cash_out/wallet_deposit` + `wallet/cash_in/wallet_deposit`. Credit disbursement = platform gives money to user. |
| 17 | `platform-expense-transfer` | 2 (transfer + payroll) | Replace with RPC per transfer/payroll item. **Remove direct `wallets.update`** at lines 76-82 and 163-169. Transfer: `platform/cash_out/system_balance_correction` + `wallet/cash_in/system_balance_correction`. Payroll: same. |
| 18 | `apply-pending-topups` | 1 (lines 138-152) | Replace with RPC: `platform/cash_out/partner_funding` + `wallet/cash_in/partner_funding`. Uses `credit` direction currently — will be normalized by the RPC guard. |
| 19 | `retry-no-smartphone-charges` | 1 (lines 111-123) | Replace with RPC: `wallet/cash_out/agent_float_used_for_rent` + `platform/cash_in/agent_repayment`. |
| 20 | `approve-rent-request` | 1 (lines 225-228) | Per user's correction: this is contract creation. Replace with RPC: `bridge/cash_in/rent_receivable_created` + `platform/cash_out/rent_disbursement` (only if money actually moves; otherwise skip ledger). |

### Direct Wallet Mutations to Remove
1. `auto-charge-wallets` lines 291-294, 404-406
2. `fund-tenant-from-pool` lines 174-186, 309-317
3. `platform-expense-transfer` lines 76-82, 163-169

### New Locked Categories Needed
- `share_capital` — already in the list
- All others already present

## Files Changed

| Asset | Count |
|-------|-------|
| 1 database migration | RPC hardening (direction normalization, wallet guard, audit log) |
| 20 edge functions | Replace direct inserts with RPC calls |
| 0 frontend changes | None |

## Safety
- `strict_mode` stays `false`
- Direction normalization catches legacy `credit`/`debit`/`in`/`out`
- Wallet negative guard prevents overdrafts at the database level
- Each function deployed atomically

