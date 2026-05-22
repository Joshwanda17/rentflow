## Auto landlord rent payout (Welile-fronted, monthly)

When an agent places a tenant into a listed house, Welile automatically credits the landlord's wallet with the monthly rent on the landlord's chosen day of the month. Tenant repayment continues through the existing `auto-charge-wallets` flow — this plan only adds the landlord-side payout leg.

### What gets built

1. **Schema (rent_requests)**
   - `landlord_payout_day` smallint (1-28), nullable until placement
   - `landlord_payout_next_run_at` timestamptz
   - `landlord_payout_last_run_at` timestamptz
   - `landlord_payout_enabled` boolean default true
   - Constraint: `landlord_payout_day BETWEEN 1 AND 28`
   - Index on `(landlord_payout_enabled, landlord_payout_next_run_at)` partial WHERE enabled

2. **Capture UI (agent flow)**
   - Add "Landlord payout day" date-of-month picker (1-28) to `AgentRentRequestDialog` and `RegisterTenantDialog`, required when the rent is approved/active.
   - Show landlord-facing copy: "Welile will pay UGX {rent} to the landlord wallet on day {N} every month."
   - Surface the chosen day + next payout date on the rent request detail drawer and on the Landlord Ops house detail dialog.

3. **Cron + edge function**
   - New edge function `pay-landlord-rent` (verify_jwt=false, service role).
   - Per active row where `landlord_payout_enabled = true AND landlord_payout_next_run_at <= now() AND status IN ('approved','disbursed','active')`:
     - Idempotency key: `landlord_rent:{rent_request_id}:{YYYY-MM}`.
     - Call `create_ledger_transaction(entries=[platform cash_out `rent_disbursement`, wallet cash_in `landlord_rent_payment` with `recipient_type='user'`, `user_id=landlord_id`])` — routes to landlord `withdrawable_balance`.
     - Emit `system_event` `landlord.rent_payout.completed`.
     - Advance `landlord_payout_next_run_at` by 1 month (clamped to day ≤ 28); set `landlord_payout_last_run_at = now()`.
     - On failure: log to `system_events` (`landlord.rent_payout.failed`), do not advance, alert FinOps.
   - pg_cron job `pay-landlord-rent-daily` at 07:00 UTC invoking the edge function (insert tool, with project URL + anon key).

4. **Funding source**
   - Welile float fronts the payout. Recovery from the tenant continues through the existing `auto-charge-wallets-daily` cron on `subscription_charges`. No coupling between the two crons; rent is decoupled from collection.

5. **Audit + trust**
   - Insert into `audit_logs` (action_type `landlord_rent_payout`, table `rent_requests`, record id, mandatory reason: `auto-landlord-monthly-payout`).
   - `capture_trust_signal` for landlord (`rent_received`) and tenant (`rent_obligation_serviced`) on each successful payout.

### Out of scope
- No changes to tenant-side `auto-charge-wallets` or to existing repayment ledger entries.
- No changes to the 6-stage rent pipeline gating; payouts only fire once a request is past `approved`.
- No FX, no partial payouts, no proration mid-month — landlord receives full `rent_amount` each cycle.

### Files
- New migration: schema + index + cron insert (cron via supabase--insert per the schedule-jobs guidance).
- New edge fn: `supabase/functions/pay-landlord-rent/index.ts`.
- Edit: `src/components/agent/AgentRentRequestDialog.tsx`, `src/components/agent/RegisterTenantDialog.tsx`, `src/components/rent/RentRequestDetailDrawer.tsx`, `src/components/executive/landlord-ops/HouseDetailsDialog.tsx`.
- Memory note: add `mem://features/landlord/auto-monthly-payout.md` documenting the flow and idempotency contract.

### Confirm before I build
Approving this plan will run a schema migration, deploy the new edge function, and create a daily pg_cron job. OK to proceed?