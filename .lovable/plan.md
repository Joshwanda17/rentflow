

# Full Ledger Architecture Compliance Audit

## Audit Methodology
Searched all 88 edge functions for: direct wallet mutations (`.update({balance})`), direct `general_ledger` inserts, missing `user_id` on platform entries, missing `transaction_date`, and `p_entries` / `scope:` anti-patterns.

## Results Summary

| Check | Status |
|-------|--------|
| ❌ Direct `.update({ balance })` | **CLEAN** — Zero remaining violations |
| ❌ `p_entries` parameter name | **CLEAN** — All fixed |
| ❌ `scope:` instead of `ledger_scope:` | **CLEAN** — All fixed |
| ❌ Direct `general_ledger.insert()` | **1 VIOLATION** |
| ❌ Missing `transaction_date` | **12 functions affected** |
| ❌ Missing `user_id` on platform entries | **11 functions affected** |

---

## CRITICAL — Direct Ledger Insert (Bypasses RPC Entirely)

### `approve-rent-request` — Lines 225-232
Directly inserts into `general_ledger` table, bypassing the RPC completely:
```typescript
await adminClient.from("general_ledger").insert({
  user_id: rentRequest.tenant_id, amount: totalRepayment,
  direction: "cash_out", category: "rent_obligation", ...
});
```
This also uses `rent_obligation` — a category NOT in the locked allowlist. With `strict_mode` enabled, this insert would be rejected by the session guard trigger (`trg_guard_ledger_write`).

**Fix**: Remove this direct insert entirely. The rent obligation is already tracked via `rent_receivable_created` in the bridge scope when the rent is funded/disbursed. This is a redundant, broken write.

---

## MEDIUM — Missing `transaction_date` on Entries

These functions rely on the database `NOW()` default instead of explicit application-level timestamps:

| Function | Affected Entries |
|----------|-----------------|
| `fund-rent-pool` | 2 entries |
| `fund-tenants` | 2 entries |
| `fund-tenant-from-pool` | 6 entries (landlord credit, pool deployment, agent bonus) |
| `portfolio-topup` | 4 entries (main + reversal) |
| `apply-pending-topups` | 2 entries |
| `coo-wallet-to-portfolio` | 2 entries |
| `manager-portfolio-topup` | 4 entries (main + reversal) |
| `process-supporter-roi` (auto-merge section) | 2 entries |
| `process-investment-interest` | 2 entries |
| `angel-pool-invest` | 2 entries |
| `manual-collect-rent` | 4 entries (tenant + agent) |
| `platform-expense-transfer` | 4 entries (single + payroll) |

**Fix**: Add `transaction_date: new Date().toISOString()` to all entries in these functions.

---

## MEDIUM — Missing `user_id` on Platform Entries

Platform contra-entries that lack `user_id`, making them untraceable to the originating user:

| Function | Missing `user_id` On |
|----------|---------------------|
| `fund-rent-pool` | Platform `cash_in` leg (supporter capital received) |
| `fund-tenants` | Platform `cash_out` leg (rent disbursement) |
| `fund-tenant-from-pool` | 3 platform legs (landlord credit, pool deployment, agent bonus) |
| `portfolio-topup` | 2 platform legs (main + reversal) |
| `apply-pending-topups` | Platform `cash_out` leg |
| `coo-wallet-to-portfolio` | Platform `cash_in` leg |
| `manager-portfolio-topup` | 2 platform legs (main + reversal) |
| `process-supporter-roi` (auto-merge) | Platform `cash_out` leg |
| `process-investment-interest` | Platform `cash_out` leg (ROI expense) |
| `angel-pool-invest` | Platform `cash_in` leg |
| `platform-expense-transfer` | 2 platform legs (single + payroll) |

**Fix**: Add the originating user's ID to each platform entry for traceability.

---

## LOW — `tenant-pay-rent` Reads from `profiles.wallet_balance`

Line 53-57: This function checks `profiles.wallet_balance` instead of `wallets.balance`. The `profiles` table likely has a stale/legacy balance field.

**Fix**: Change to read from `wallets` table.

---

## Files to Modify (18 total)

| File | Changes |
|------|---------|
| `approve-rent-request/index.ts` | Remove direct `general_ledger.insert()` (lines 222-233) |
| `fund-rent-pool/index.ts` | Add `transaction_date` + `user_id` to platform entry |
| `fund-tenants/index.ts` | Add `transaction_date` + `user_id` to platform entry |
| `fund-tenant-from-pool/index.ts` | Add `transaction_date` + `user_id` to 3 platform entries |
| `portfolio-topup/index.ts` | Add `transaction_date` + `user_id` to 2 platform entries |
| `apply-pending-topups/index.ts` | Add `transaction_date` + `user_id` to platform entry |
| `coo-wallet-to-portfolio/index.ts` | Add `transaction_date` + `user_id` to platform entry |
| `manager-portfolio-topup/index.ts` | Add `transaction_date` + `user_id` to 2 platform entries |
| `process-supporter-roi/index.ts` | Add `transaction_date` + `user_id` to auto-merge platform entry |
| `process-investment-interest/index.ts` | Add `transaction_date` + `user_id` to platform entry |
| `angel-pool-invest/index.ts` | Add `transaction_date` + `user_id` to platform entry |
| `manual-collect-rent/index.ts` | Add `transaction_date` to all 4 entries |
| `platform-expense-transfer/index.ts` | Add `transaction_date` + `user_id` to 2 platform entries |
| `tenant-pay-rent/index.ts` | Fix wallet balance read from `wallets` table instead of `profiles` |

## What's Already Clean
These functions passed all checks: `approve-deposit`, `approve-withdrawal`, `approve-loan-application`, `agent-deposit`, `agent-withdrawal`, `product-purchase`, `wallet-transfer`, `wallet-deduction`, `disburse-rent-to-landlord`, `credit-landlord-registration-bonus`, `credit-landlord-verification-bonus`, `approve-listing-bonus`, `cfo-direct-credit`, `auto-charge-wallets`, `retry-no-smartphone-charges`, `process-credit-daily-charges`, `approve-wallet-operation`, `agent-angel-pool-invest`, `agent-invest-for-partner`, `fund-agent-landlord-float`, `process-agent-advance-deductions`, `process-credit-draw`, `tenant-pay-rent` (ledger entries OK, only balance source wrong).

## Deployment
Redeploy all 14 modified edge functions after fixes.

