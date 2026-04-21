

## Send Funder Disbursement Email From `WithdrawFlow`

### Problem
The `returns-disbursement-confirmation` email is wired into `WithdrawRequestDialog` (used elsewhere) but NOT into `WithdrawFlow.tsx` — which is the component the **Funder/Partner dashboard** opens via `PartnerWalletWidget`. So when a partner withdraws from their dashboard, the request lands in `withdrawal_requests` but no disbursement email is queued.

`approve-withdrawal` deliberately does not send the email either (comment at line 429: *"Disbursement email is sent at withdrawal-confirm time (client-side)…"*) — so no path currently emails partners who use the new `WithdrawFlow`.

### Solution
After a successful insert into `withdrawal_requests` inside `WithdrawFlow.processWithdrawal()`, detect whether the user is a **partner/funder** and, if so, queue the existing `returns-disbursement-confirmation` template via `send-transactional-email` — mirroring the logic already proven in `WithdrawRequestDialog`.

### How we know it's a funder/partner
Two signals (either qualifies):
1. `user_roles.role = 'supporter'` for this user, OR
2. The user has at least one row in `investor_portfolios` (they've ever invested).

This matches the existing pattern (`WithdrawRequestDialog` keys off `investor_portfolios` lookup) and the `ussd-callback` funder detection (`role = 'supporter'`).

### Changes (single file)
**`src/components/payments/WithdrawFlow.tsx`** — extend `processWithdrawal()`:

1. After the successful `withdrawal_requests` insert, fetch in parallel:
   - `profiles.email, full_name` for `user.id`
   - latest `investor_portfolios.portfolio_code` for `user.id`
   - `user_roles` row where `role = 'supporter'`
2. If `email` exists AND (supporter role OR a portfolio exists), call:
   ```ts
   supabase.functions.invoke('send-transactional-email', {
     body: {
       templateName: 'returns-disbursement-confirmation',
       recipientEmail: profile.email,
       idempotencyKey: `partner-withdraw-${user.id}-${Date.now()}`,
       templateData: {
         partner_name, transaction_id: ref, portfolio_code,
         amount, currency: 'UGX', date,
         payout_method: <derived from payoutMode + momoProvider/bankName>,
         company_name: 'Welile',
         logo_url: 'https://welilereceipts.com/welile-logo.png',
         is_managed_by_agent: false, agent_name: '',
       },
     },
   });
   ```
3. Wrap in try/catch (non-blocking) — if email enqueue fails, the withdrawal still succeeds; log a warning. Same hygiene as the existing implementation.
4. Skip silently for non-funders (tenants, agents, landlords using the same flow) so we don't spam them with a "Returns Disbursement" email.

### Why no edge-function change
- `send-transactional-email` and the `returns-disbursement-confirmation` template already exist and are exercised by `WithdrawRequestDialog`.
- `approve-withdrawal` already has a comment stating the email is intentionally client-side at request time. Keeping that contract avoids duplicate emails when the manager later approves.

### Verification
1. Log in as a funder → open Funder dashboard → Rent Money → **Withdraw** → complete the flow.
2. Check the partner's email inbox → "Returns Disbursement Confirmation" arrives within ~30s.
3. Log in as a tenant/agent and withdraw via the same component → no disbursement email is sent (only their normal flow).
4. Check `email_send_log` (or equivalent) for the `partner-withdraw-…` idempotency key.

