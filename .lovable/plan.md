

# Lock Down the General Ledger — 4-Layer Financial Fortress

## Current State

- RLS is **enabled** on `general_ledger` ✅
- But the INSERT policy is `WITH CHECK (true)` — anyone authenticated can insert directly ❌
- No REVOKE on INSERT/UPDATE/DELETE for authenticated role ❌
- No `ledger.authorized` session guard ❌
- `strict_mode` is seeded as `FALSE` ❌

## Changes — Single Database Migration

### Layer 1: Enable Strict Mode

```sql
UPDATE treasury_controls SET enabled = TRUE WHERE control_key = 'strict_mode';
```

### Layer 2: Revoke Direct Write Access

```sql
REVOKE INSERT, UPDATE, DELETE ON public.general_ledger FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.general_ledger FROM authenticated;
```

The `create_ledger_transaction` RPC is `SECURITY DEFINER` — it executes as the function owner (superuser), bypassing these restrictions. All existing triggers are also `SECURITY DEFINER`, so they continue to work.

### Layer 3: Replace Permissive RLS Policies with Deny-All Writes + Controlled Reads

Drop the existing wide-open INSERT policy, then create tight policies:

```sql
-- Remove the permissive insert policy
DROP POLICY IF EXISTS "System can insert ledger entries" ON public.general_ledger;

-- Block all direct writes via RLS
CREATE POLICY "no_direct_inserts" ON public.general_ledger
  FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY "no_updates" ON public.general_ledger
  FOR UPDATE TO authenticated USING (false);

CREATE POLICY "no_deletes" ON public.general_ledger
  FOR DELETE TO authenticated USING (false);
```

Existing SELECT policies (user own entries, managers, executives) remain unchanged.

### Layer 4: RPC-Only Session Guard

Inside `create_ledger_transaction`, set a session config before inserting:

```sql
PERFORM set_config('ledger.authorized', 'true', true);
```

Then add a BEFORE INSERT trigger on `general_ledger`:

```sql
CREATE OR REPLACE FUNCTION public.guard_ledger_write()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('ledger.authorized', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Unauthorized ledger write — must use create_ledger_transaction RPC';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_guard_ledger_write
  BEFORE INSERT ON public.general_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_ledger_write();
```

All existing `SECURITY DEFINER` triggers that insert into the ledger (deposit, agent earnings, platform transactions) also need to set this config before their INSERT. Each will be updated to include `PERFORM set_config('ledger.authorized', 'true', true);` before their ledger INSERT statement.

## Affected Triggers (Need Authorization Flag)

These existing triggers insert directly into `general_ledger` and must be updated:
1. `log_platform_transaction_to_ledger` — platform_transactions trigger
2. `log_agent_earning_to_ledger` — agent_earnings trigger
3. `log_deposit_to_ledger` — deposit_requests trigger

Each gets one line added: `PERFORM set_config('ledger.authorized', 'true', true);`

## Result

```text
Frontend / API
     ↓
Edge Function (authenticated)
     ↓
create_ledger_transaction RPC (SECURITY DEFINER)
     ↓  sets ledger.authorized = true
     ↓
BEFORE INSERT trigger checks ledger.authorized
     ↓  ✅ passes
general_ledger (INSERT succeeds)

Direct INSERT attempt:
     ↓
REVOKE blocks at permission level  ← Layer 2
     ↓  (if somehow bypassed)
RLS policy WITH CHECK (false)      ← Layer 3
     ↓  (if somehow bypassed)
Trigger checks ledger.authorized   ← Layer 4
     ↓  ❌ EXCEPTION raised
```

No frontend or edge function changes needed. Single migration file.

