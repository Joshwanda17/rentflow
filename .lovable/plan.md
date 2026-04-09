

# Fix Two Partner Activations

## Findings

1. **DANIEL DOMINIC BENJAMIN** (`dominic10christ@gmail.com`, `0761743813`)
   - `supporter_invites` status = `activated` but **no profile, wallet, or role exists**
   - This is the known "activated but invisible" bug — the activation set the status without creating platform metadata
   - Needs: profile, wallet, and user_role created, or re-activate via the manager's manual activation flow

2. **"ginahemilio7@gmail.com"** — the actual email in the system is **`ginehemilio7@gmail.com`** (typo: `gine` not `gina`), phone `0750521224`, name "User 1224"
   - Status is still **`pending`** — not yet activated at all
   - Needs: standard activation via the Pending Invites tab in Platform Users

## Plan

### Step 1: Fix DANIEL DOMINIC BENJAMIN (activated but missing metadata)
- Reset the `supporter_invites` status back to `pending` via a migration so the manager can re-activate cleanly through the UI
- OR: directly provision the missing profile, wallet, and role via the `activate-supporter` edge function call from the manager UI

The cleanest approach: **use a migration to reset status to `pending`**, then activate both users through the Platform Users → Pending Invites → Activate flow.

### Step 2: Fix email typo for ginahemilio7
- The invite has email `ginehemilio7@gmail.com` — if the correct email is `ginahemilio7@gmail.com`, update it via migration
- Then activate normally

### Step 3: Activate both via Platform Users
- Both will appear in Pending Invites after the fixes
- Manager clicks Activate on each

### Migration SQL
```sql
-- Fix DANIEL DOMINIC: reset to pending so manager can re-activate
UPDATE supporter_invites 
SET status = 'pending' 
WHERE id = 'b38278f8-47f2-43a6-a70e-893c1d7dc688';

-- Fix email typo for the other user (if ginahemilio7 is correct)
UPDATE supporter_invites 
SET email = 'ginahemilio7@gmail.com' 
WHERE id = '508696e0-6bca-47bf-bc24-d5c72f1f8ca7' 
  AND email = 'ginehemilio7@gmail.com';
```

### Files changed
1. **Migration** — reset Daniel's invite status to `pending` + fix email typo

After migration, both users will be visible in Pending Invites for manual activation through the existing UI flow.

