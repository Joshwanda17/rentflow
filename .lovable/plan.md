

## Why "Mutamba Rodgers" referrals show as Unknown

### Root cause (verified in DB)

The user is **MUTAMBA RODGERS** (id `972f4990-1c4e-4c96-a220-9c9463f58dbf`). He has 5 rows in `public.referrals`:

| created_at | referred_id | exists in `profiles`? | exists in `auth.users`? | UI shows |
|---|---|---|---|---|
| 2026-02-08 | 64f25e03… | ✅ Ssematimba Hanest | ✅ | "Ssematimba Hanest" |
| 2026-04-20 08:34 | 5e274319… | ❌ | ❌ | **Unknown** |
| 2026-04-20 18:49 | 1813214a… | ❌ | ❌ | **Unknown** |
| 2026-04-21 10:21 | 46027971… | ❌ | ❌ | **Unknown** |
| 2026-04-21 11:42 | 673b6672… | ❌ | ❌ | **Unknown** |

The `Referrals.tsx` page renders `referral.referred_name || 'Unknown'`. The name is enriched in `supabase/functions/user-snapshot/index.ts` by joining `referrals.referred_id → profiles.id`. When the join fails, name comes back null → "Unknown".

**Why the join fails:** `public.referrals` has no foreign keys (`referrals_pkey` and `referrals_unique_pair` are the only constraints). So `referred_id` can hold UUIDs that don't (or no longer) point at any real user. The four orphaned UUIDs above exist in neither `profiles` nor `auth.users` — they are dangling pointers.

These orphans were almost certainly created by an edge function path (`submit-tenant-form`, `register-tenant`, `submit-partner-form`, `create-supporter-invite`) that inserted into `referrals` for a partner/tenant that the agent started onboarding but whose `auth.users` row was rolled back or later deleted, leaving the referral row behind.

### Fix (two layers)

#### 1. Stop showing "Unknown" — show what we know

Update the snapshot to fall back to a human-readable identifier when the profile is missing, rather than rendering a useless "Unknown".

In `supabase/functions/user-snapshot/index.ts` (around line 216):
- After the `profileMap` lookup, if no profile is found, attempt a second lookup against any pending/onboarding sources keyed by the same id (e.g. an `auth.users` admin lookup, or a stored `pending_signups` table if we choose to add one).
- If still nothing, return a tagged label like `"Onboarding incomplete"` (with the short id appended, e.g. `"Onboarding incomplete · …d77e35"`) instead of `null`.

In `src/pages/Referrals.tsx` (line 237):
- Replace the bare `'Unknown'` fallback with the same `"Onboarding incomplete"` label, plus a small muted note: *"This invitee never finished sign-up. Bonus stays pending."*
- Visually mark the row (lower opacity + an `AlertCircle` icon) so it's obvious it's not a real, completed referral.

#### 2. Stop creating new orphans

Add a hardening migration:

```sql
-- Add FK so referrals can never point at a non-existent profile
ALTER TABLE public.referrals
  ADD CONSTRAINT referrals_referred_id_fkey
  FOREIGN KEY (referred_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;
```

Before that constraint can be added, the 4 orphan rows (and any others platform-wide) must be cleaned. The migration runs in this order:
1. `SELECT count(*) FROM referrals r LEFT JOIN profiles p ON p.id = r.referred_id WHERE p.id IS NULL;` — log it.
2. `DELETE FROM referrals r WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = r.referred_id);` — purge orphans.
3. Add the FK above.

This guarantees: future referral rows are deleted automatically when a profile is removed, and they can never be inserted pointing at a non-existent profile.

#### 3. Audit log entry

Write a single `audit_logs` entry (`action_type='referrals_orphan_cleanup'`, `table_name='referrals'`, `reason='cleanup_orphan_referrals_blocking_FK_addition'`) recording the count purged, so the deletion is traceable.

### Files touched

- `supabase/functions/user-snapshot/index.ts` — improved fallback label for missing referred profile.
- `src/pages/Referrals.tsx` — replace `'Unknown'` with informative label + visual treatment.
- New migration `*_referrals_fk_and_orphan_cleanup.sql` — count + delete orphans, add FK on `referred_id`, audit log entry.

### What you'll see after the fix

- Mutamba Rodgers's Referrals screen will show his 1 real referral ("Ssematimba Hanest") clearly, and the 4 incomplete sign-ups will be labelled **"Onboarding incomplete"** in muted style with a tooltip explaining why no bonus was credited — instead of the alarming "Unknown" label.
- Going forward, no referral row can ever exist without a matching profile, so this class of bug disappears.

