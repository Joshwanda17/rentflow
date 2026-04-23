
## Plan: Fix the current financial-action errors and remove the remaining silent failures

### What I found

There are two different problems happening at once:

1. **Backend wallet routing bug**
   - `wallet-deduction` is trying to use category `float_retraction`.
   - Edge logs show:
     ```text
     Category "float_retraction" is not in the locked allowlist
     ```
   - That means the new float-overflow split logic was added in the edge function, but the category was never registered in the platform’s locked ledger rules.

2. **Some buttons still fail silently because the UI only checks `error`, not `data?.error`**
   - Several deposit/withdrawal approval screens still call `supabase.functions.invoke(...)` directly.
   - Many of them only handle SDK transport errors, so a structured backend response like:
     ```json
     { "error": "Insufficient withdrawable balance..." }
     ```
     can still be missed.

There is also a third important detail:

3. **CFO direct debit is not fully fixed yet**
   - Logs show `cfo-direct-credit` still hitting:
     ```text
     new row for relation "wallets" violates check constraint "wallets_balance_check"
     ```
   - The current debit split logic still depends on a float fallback category that is not fully aligned with the router/allowlist setup.

### Implementation plan

#### 1) Fix float-backed debits with a valid ledger category
Use an existing production category instead of the unregistered `float_retraction`.

- Update:
  - `supabase/functions/wallet-deduction/index.ts`
  - `supabase/functions/cfo-direct-credit/index.ts`
- Replace the float-overflow debit leg from `float_retraction` to an already approved float cash-out category:
  - `agent_float_settlement`
- Then update the wallet router so that `agent_float_settlement` is explicitly treated as a **float bucket** category.

Why this path:
- `agent_float_settlement` already exists in the strict allowlist / locked categories.
- It avoids inventing a brand-new category and reduces the chance of another strict-mode failure.

#### 2) Patch the wallet router so float settlement actually drains float
Create a database migration that updates `wallet_route_for_category(...)` so:

```text
agent_float_settlement -> float bucket
sign follows direction
```

This ensures that when the edge functions split a debit:
- first leg drains `withdrawable`
- overflow leg drains `float`

instead of trying to route back into `withdrawable` and tripping wallet balance checks.

#### 3) Keep bucket-aware prechecks in the edge functions
For both:
- `wallet-deduction`
- `cfo-direct-credit` debit branch

Use this rule:

```text
if withdrawable >= amount:
  use single withdrawable debit
else if withdrawable + float >= amount:
  split debit into withdrawable portion + float portion
else:
  return structured 400 error with bucket breakdown
```

Expected backend error shape:
```json
{
  "error": "Insufficient balance. Withdrawable: UGX X, Float: UGX Y, Requested: UGX Z"
}
```

#### 4) Roll out the global edge-error wrapper to the approval buttons
Adopt `src/lib/invokeEdgeFunction.ts` for the financial actions that still use raw `supabase.functions.invoke(...)`.

Priority callsites:

**Deposit approval / rejection**
- `src/components/manager/DepositRequestsManager.tsx`
- `src/pages/DepositsManagement.tsx`
- `src/components/agent/PendingDepositsSection.tsx`
- `src/components/financial-ops/DepositStatsPanel.tsx`
- `src/components/financial-ops/TidVerification.tsx`

**Withdrawal approval / rejection**
- `src/components/financial-ops/FinOpsWithdrawalVerification.tsx`
- `src/components/cfo/CFOWithdrawalApprovals.tsx`
- `src/components/financial-ops/FloatPayoutVerification.tsx`

**Already-related financial actions worth aligning**
- `src/components/financial-ops/WalletDeductionPanel.tsx`
- `src/components/cfo/DirectCreditTool.tsx` (preserve its special 409 confirmation flow for non-commission agent credits)

The goal is:
- every edge failure shows a toast
- every structured backend error body is surfaced
- no button appears to do nothing

#### 5) Handle partial-success batch responses properly
Some deposit bulk actions return `data.results` rather than a single hard failure.

For bulk approve/reject screens:
- parse `results`
- show per-item backend error summaries when present
- avoid generic messages like “Failed to approve 1 deposit” when the backend already returned the exact reason

### Files to change

**Backend**
- `supabase/functions/wallet-deduction/index.ts`
- `supabase/functions/cfo-direct-credit/index.ts`
- new migration updating `wallet_route_for_category(...)`

**Frontend**
- `src/lib/invokeEdgeFunction.ts` (only if a small enhancement is needed for special-case handling)
- `src/components/manager/DepositRequestsManager.tsx`
- `src/pages/DepositsManagement.tsx`
- `src/components/agent/PendingDepositsSection.tsx`
- `src/components/financial-ops/DepositStatsPanel.tsx`
- `src/components/financial-ops/TidVerification.tsx`
- `src/components/financial-ops/FinOpsWithdrawalVerification.tsx`
- `src/components/cfo/CFOWithdrawalApprovals.tsx`
- `src/components/financial-ops/FloatPayoutVerification.tsx`
- `src/components/financial-ops/WalletDeductionPanel.tsx`
- `src/components/cfo/DirectCreditTool.tsx`

### Verification checklist

1. **Wallet deduction from float-backed wallet**
   - user has `withdrawable=0`, `float>0`
   - deduction succeeds by draining float through valid category routing

2. **CFO direct debit**
   - debit against user with float-backed funds no longer throws `wallets_balance_check`
   - if insufficient total funds, toast shows exact backend message

3. **Confirm deposit buttons**
   - forced backend rejection always shows the structured reason in a toast
   - no silent confirm/reject actions

4. **Withdrawal approval buttons in Financial Ops**
   - approve/reject always show backend errors
   - `INSUFFICIENT_WITHDRAWABLE`, permission failures, and state conflicts all surface visibly

5. **Batch deposit actions**
   - mixed-result responses show exact failure reasons, not only a generic fail count

### Technical note

Current evidence strongly indicates the main runtime break is not just “missing toasts”:
```text
wallet-deduction -> Category "float_retraction" is not in the locked allowlist
cfo-direct-credit -> wallets_balance_check violation
```

So the fix needs both layers:
- backend category/router correction
- shared frontend error surfacing
