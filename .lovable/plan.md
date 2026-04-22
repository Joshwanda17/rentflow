

## Fix referral bonus pipeline (forward-only, no backfill)

### Rules locked in
- **Bonus**: UGX 500 per successful signup-via-link.
- **Auto-credit**: fires the moment a new profile is created with a `referrer_id` (no Fin-Ops queue).
- **Accounting**: booked as `marketing_expense` on the platform side.
- **Agent visibility**: lands in **Commission** AND **Withdrawable** automatically.
- **No backfill** — the 3-week gap stays as-is. Runaway-count accounts are left untouched (no risk of mass payout).

### What changes (1 migration only)

**1. Drop the duplicate / broken triggers**
```sql
DROP TRIGGER IF EXISTS on_profile_referral ON public.profiles;
DROP TRIGGER IF EXISTS trg_credit_referral_bonus ON public.profiles;
DROP TRIGGER IF EXISTS trg_credit_signup_bonus_insert ON public.referrals;
DROP TRIGGER IF EXISTS trg_credit_signup_bonus_update ON public.referrals;
DROP TRIGGER IF EXISTS trg_credit_signup_referral_bonus ON public.referrals;
```

**2. Rewrite `credit_referral_bonus()`** — fires on `profiles` INSERT
- Uses real columns (`referred_id`, not `referred_user_id`).
- Inserts ONE `referrals` row with `bonus_amount = 500`, `credited = false`, `ON CONFLICT (referrer_id, referred_id) DO NOTHING`.
- Does not write to ledger directly.

**3. Rewrite `credit_signup_referral_bonus()`** — fires on `referrals` row creation
- Idempotent via `transaction_group_id = 'referral-bonus-' || NEW.id`.
- Skips if a ledger row with that group already exists.
- Sets session flags (`wallet.sync_authorized`, `ledger.authorized`) per Layer-4 ledger guard.
- Writes balanced double-entry via `create_ledger_transaction`:

```text
Platform leg : marketing_expense   cash_out  500   scope=platform
Wallet  leg  : referral_bonus      cash_in   500   scope=wallet  user=referrer
```

- Wallet router (already in allow-list) lands the cash_in into `withdrawable_balance`.
- Sets `referrals.credited = true`, `credited_at = now()`.

**4. Re-attach exactly one trigger per table**
```sql
CREATE TRIGGER trg_credit_referral_bonus
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  WHEN (NEW.referrer_id IS NOT NULL)
  EXECUTE FUNCTION public.credit_referral_bonus();

CREATE TRIGGER trg_credit_signup_referral_bonus
  AFTER INSERT ON public.referrals
  FOR EACH ROW
  WHEN (NEW.bonus_amount > 0)
  EXECUTE FUNCTION public.credit_signup_referral_bonus();
```

### Why it surfaces correctly (no UI changes needed)
- `useAgentBalances.ts` already sums `referral_bonus` cash-ins into `commissionBalance` → **Commission goes up by 500.**
- Wallet router already maps `referral_bonus` → `withdrawable_balance` → **Withdrawable goes up by 500.**
- `ManagerBankingLedger.tsx` already labels these rows "👥 Referral Reward — Earned for bringing a friend".

### Files
- 1 new migration: `supabase/migrations/<ts>_fix_referral_bonus_pipeline.sql`
- No client / edge-function changes.

### Acceptance test (live, no seed data)
1. Agent shares `${origin}/join?r=<agentId>`.
2. New tester signs up via that link.
3. Within 1–2 sec: 1 row in `referrals`, 2 balanced rows in `general_ledger` (group `referral-bonus-<id>`).
4. Agent's wallet card: **Commission +500**, **Withdrawable +500**.
5. Repeat signup with same `referred_id` → no duplicate (ON CONFLICT + transaction_group_id idempotency).

