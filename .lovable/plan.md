
Issue confirmed.

What is actually happening:
- The tenant repayment is being recorded, so the 40k is correctly reducing the tenant’s rent balance.
- The missing commission is now a backend logic bug, not an edge-function wiring bug.
- Do I know what the issue is? Yes.

Root cause I found:
1. The current `credit_agent_rent_commission` function uses the wrong idempotency key.
   - It checks only:
     - `rent_request_id`
     - `agent_id`
     - `commission_role`
     - `event_type = 'repayment'`
   - That means once a commission has ever been credited for that rent request/role, later repayments on the same rent request are treated like duplicates and no new commission rows are inserted.
   - So a second or later collection like this 40k can reduce the loan but award zero new commission.

2. The RPC response is misleading.
   - It always returns `total_commission = 10% of repayment`,
   - but that value is calculated before knowing whether anything was actually inserted.
   - So the backend can say “4,000 commission” while the wallet gets nothing.

3. The commission function needs a clean rewrite anyway.
   - One surviving function version in migrations still writes to old/non-current ledger fields (`type`, `source`) instead of the current ledger schema (`direction`, `category`, `source_table`, `source_id`).
   - Even if the latest function is active now, the safest fix is to replace the function from scratch in one fresh migration.

What I will change:
1. Replace `credit_agent_rent_commission` with one clean, final version
   - Keep a single function signature.
   - Use the current ledger schema only.
   - Keep 10% total commission logic.
   - Preserve the existing split model unless you want it changed separately.

2. Fix idempotency to be per repayment event, not per rent request
   - Add an event reference input, using a deterministic payment-level key.
   - Store that event reference in `commission_accrual_ledger.source_id`.
   - This allows multiple repayments on the same rent request to each earn commission once.

3. Update all repayment callers to pass a unique payment event reference
   - `supabase/functions/agent-deposit/index.ts`
   - `supabase/functions/approve-deposit/index.ts`
   - `supabase/functions/auto-charge-wallets/index.ts`
   - `supabase/functions/manual-collect-rent/index.ts`
   - `supabase/functions/retry-no-smartphone-charges/index.ts`
   - `supabase/functions/tenant-pay-rent/index.ts`
   - Where a transaction group already exists, reuse it.
   - Where one flow can create multiple repayment stages, pass distinct stage-specific references.

4. Return the real credited amount from the commission RPC
   - Add fields like:
     - `credited_commission`
     - `total_commission`
     - `status`
   - `credited_commission` will reflect what was actually inserted into ledger/accrual rows.
   - `agent-deposit` will use `credited_commission`, not the theoretical total.

5. Keep the ledger single-writer behavior intact
   - Commission credits will continue to come from ledger inserts with `transaction_group_id`.
   - Platform-side entries remain `marketing_expense` in platform scope.
   - Agent-side entries remain `agent_commission` in wallet scope.

Files involved:
- New migration in `supabase/migrations/`
- `supabase/functions/agent-deposit/index.ts`
- `supabase/functions/approve-deposit/index.ts`
- `supabase/functions/auto-charge-wallets/index.ts`
- `supabase/functions/manual-collect-rent/index.ts`
- `supabase/functions/retry-no-smartphone-charges/index.ts`
- `supabase/functions/tenant-pay-rent/index.ts`

Expected result after the fix:
- A 40k repayment event can award commission even if the same rent request had earlier repayments.
- The agent wallet will increase exactly once per repayment event.
- The response shown to the app will match the actual credited amount.
- Repeated partial repayments on one rent request will no longer silently skip commission.

Technical note:
```text
Current bug:
idempotency key = rent_request_id + agent_id + commission_role + repayment

Needed:
idempotency key = payment_event_reference + agent_id + commission_role + repayment

Effect:
multiple repayments on one rent request currently collapse into one commission award
```
