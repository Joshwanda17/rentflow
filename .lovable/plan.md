## Diagnosis (confirmed against production data)

Kalyango Timothy (`2c6569ce…`) has a referrals row for invitee Tarzan Mark (`94edf49f…`) dated 2026‑07‑20 08:40 with `bonus_amount = 500`, `credited = true`, `credited_at` set — **but zero matching `general_ledger` entries and `wallets.withdrawable_balance = 0`**.

Root cause: there are two competing referral‑credit paths and they collide.

1. **Legacy path** – DB trigger `trg_credit_referral_bonus` on `public.profiles` (function `credit_referral_bonus`) fires when a new profile is created with `referrer_id`. It:
   - INSERTs the `referrals` row already marked `credited = true`
   - Runs `UPDATE public.wallets SET balance = balance + 500` — this touches only the inert legacy `wallets.balance` column, **not** the `withdrawable_balance` bucket, and never posts to `general_ledger`. Under the Wallet Write Lockdown (`enforce_wallet_ledger_only`) it is either silently ignored or writes to a column no user‑facing balance reads.

2. **Ledger‑based path** – trigger `trg_credit_signup_referral_bonus` on `public.referrals` calls `try_credit_qualified_referrals`, which only processes rows where `credited = false`. Because path #1 already set `credited = true`, this path skips the row and no ledger entries are ever created.

Net effect for Timothy (and every referrer since the ledger path was introduced): the referral is *recorded* as credited, but no money reaches `withdrawable_balance` and `get_user_available_balance` correctly returns 0.

## Plan

### 1. Retire the legacy trigger (migration)
- `DROP TRIGGER trg_credit_referral_bonus ON public.profiles;`
- Keep the `credit_referral_bonus` function definition for now (unattached) so historical references don't break, with a comment marking it retired.

### 2. Fix the trigger arg on the ledger path (migration)
`credit_signup_referral_bonus` currently calls `try_credit_qualified_referrals(NEW.referrer_id)` — the parameter is named `p_referred_id`, so it should be `NEW.referred_id`. Passing the referrer means it looks up referrals where the *referrer* is the invitee, which never matches for the row just inserted. Change to `NEW.referred_id`.

### 3. Backfill Timothy + any other affected referrers (migration, one-shot)
For every `referrals` row where `credited = true` AND no matching `general_ledger` row with `idempotency_key = 'referral_signup:' || id` exists AND `bonus_amount > 0` AND the referrer is not frozen:
- Flip `credited = false, credited_at = NULL` on those rows
- Call `try_credit_qualified_referrals(referred_id)` for each so the standard ledger path posts the correct double-entry (`marketing_expense` platform leg + `referral_bonus` wallet leg into `withdrawable_balance`).

This automatically credits Timothy UGX 500 through the same audited path all new signups will use going forward, and no wallet buckets are touched directly.

### 4. Verify
- Re-query Timothy's `wallets.withdrawable_balance`, `general_ledger` referral entries, and `get_user_available_balance` — expect UGX 500.
- Spot-check 2–3 other referrers surfaced by the backfill.

### Technical notes
- No frontend changes.
- No new tables. Only trigger drop, one function edit, and a one-shot backfill DO block — all in a single migration.
- Idempotency key `referral_signup:<referral_id>` prevents any double payout even if the backfill runs twice.
- Complies with Wallet Sole Writer rule: crediting flows through `create_ledger_transaction` → ledger trigger → `apply_wallet_movement`.
