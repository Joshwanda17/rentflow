# Tenant Overdue Penalty (33%)

## Goal
When an active rent (`rent_requests.status = 'disbursed'`) reaches the end of its `duration_days` and still has an outstanding balance, automatically apply a **33% penalty** on the outstanding amount. The penalty must:
- Add to what the tenant owes (so daily auto-charge keeps collecting it).
- Land in the ledger as platform revenue and show up in the CFO Income Statement.
- Be idempotent (one penalty per overdue cycle, never doubled).
- Trigger an SMS / in-app notification.

No new tables. We reuse `rent_requests`, `general_ledger`, and the existing `tenant_default_charge` ledger category that's already on the allowlist.

## Mechanics

Formula matches the existing 33%/30-day rent constitution:

```text
outstanding   = total_repayment - amount_repaid
penalty       = ceil(outstanding * 0.33)
new_total     = total_repayment + penalty
new_daily     = ceil((new_total - amount_repaid) / GRACE_DAYS)   # GRACE_DAYS = 30
```

Re-application: if a rent stays overdue for another full 30-day cycle without being cleared, the penalty is applied again on the *current* outstanding (compounding, consistent with `Rent × 1.33^n`).

Idempotency key:
```text
rent:<rent_request_id>:overdue_penalty:<cycle_index>
```
where `cycle_index = floor((today - duration_end_date) / 30)`.

## Ledger entry (per penalty)

Single double-entry transaction via `create_ledger_transaction`, scope `bridge`, category `tenant_default_charge`, `source_id = rent_request_id`:

| Leg | direction | account | amount |
|---|---|---|---|
| 1 | `cash_in`  | platform revenue (`tenant_default_charge`) | penalty |
| 2 | `cash_out` | tenant receivable (bridge) anchored to `tenant_id` | penalty |

This mirrors the pattern already used in `agent_allocate_tenant_payment` (bridge ledger, no landlord wallet write) so it cannot trip the wallet FK guard.

## Backend work

1. **New edge function** `apply-rent-overdue-penalty` (no new tables):
   - Selects `rent_requests` where `status='disbursed'` and `disbursed_at + duration_days * 1 day < now()` and `total_repayment - amount_repaid > 0`.
   - For each row: compute `cycle_index`; check `general_ledger` for an existing row with the matching `idempotency_key`; if absent, post the ledger entry above and `UPDATE rent_requests SET total_repayment = total_repayment + penalty, daily_repayment = ceil((total_repayment + penalty - amount_repaid)/30), schedule_status = 'overdue'`.
   - Fires `notifications` insert + `send-sms` invoke for the tenant ("Your rent expired with UGX X outstanding. A 33% penalty of UGX Y has been added.").
   - Standard `corsHeaders`, `adminClient.auth.getUser` pattern, idempotent, batched.

2. **Cron job** added via migration: schedule `apply-rent-overdue-penalty` daily at 06:30 UTC (right after `auto-charge-wallets` at 06:00).

3. **Reporting**:
   - Add `tenant_default_charge` to `CFO_REVENUE_CATEGORIES` in `src/lib/ledgerConstants.ts` with label "Tenant Default Penalty" so it appears in CFO Income Statement, Revenue panels, and the per-category report description.
   - Extend `useFinancialStatements` / income-statement aggregator to include this category in total revenue (it already reads from `general_ledger`, so adding the label is enough).

4. **Tenant UI**:
   - In `TenantProfileView` and the tenant's own dashboard, show an "Overdue + Penalty" badge when `schedule_status='overdue'` and surface the penalty amount derived from ledger rows (`category = 'tenant_default_charge'`, `source_id = rent_request_id`).

## Files to touch
- `supabase/functions/apply-rent-overdue-penalty/index.ts` (new)
- `supabase/migrations/<ts>_overdue_penalty_cron.sql` (cron schedule only — no new tables)
- `src/lib/ledgerConstants.ts` (add revenue label + description)
- `src/components/agent/TenantProfileView.tsx` (badge + penalty line)
- Tenant dashboard card (small "Penalty applied" notice)

## Out of scope
- No schema changes, no new tables.
- No change to the 1.33^n formula for *active* rent — penalty only kicks in after `duration_days` elapse.
- Withdrawable / wallet bucket logic untouched.
