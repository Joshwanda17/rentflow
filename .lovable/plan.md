

## Remove One-Withdrawal-Per-Day Limit

### Problem
A database trigger `trg_enforce_one_withdrawal_per_day` on `withdrawal_requests` blocks users from submitting more than one pending withdrawal per day, raising the error: *"You have already submitted a withdrawal request today."*

### Solution
Drop the trigger and its function via a single database migration.

### Database Migration

```sql
DROP TRIGGER IF EXISTS trg_enforce_one_withdrawal_per_day ON public.withdrawal_requests;
DROP FUNCTION IF EXISTS public.enforce_one_withdrawal_per_day();
```

### Files Changed
| File | Change |
|------|--------|
| New migration | Drop trigger + function |

No frontend changes needed — the error originates entirely from the database trigger.

