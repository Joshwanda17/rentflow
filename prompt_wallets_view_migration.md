# The "Wallets View" Migration (Lovable Instructions)

**Copy and paste the exact prompt below into Lovable:**

***

**PROMPT TO LOVABLE:**

Please execute the following database architectural migration to permanently solve the phantom balance sync issues. 

**Context:**
Currently, our frontend queries the `wallets` table to display balances (e.g., `supabase.from('wallets')`). However, the true balance is derived from the `general_ledger` (accessible via the `v_user_wallet_strict` view). To avoid patching 50+ frontend files manually, we are going to drop the physical `wallets` table and replace it with a PostgreSQL View. This View will seamlessly inject the strict ledger truth into the `balance` column, instantly fixing the frontend 5.9M bugs without modifying a single line of React code!

**Action Required:**
1. Please create a new migration file: `supabase/migrations/[timestamp]_wallets_view_architecture.sql`.
2. Insert the following SQL exactly as written. It handles renaming the physical table, creating the new View, and setting up an `INSTEAD OF` trigger so that legacy backend `INSERT` statements don't crash.
3. Deploy this migration to the database.

```sql
-- 1. Rename the physical table to get it out of the way
ALTER TABLE public.wallets RENAME TO wallets_physical;

-- 2. Create the new View named exactly "wallets" so the frontend queries keep working
CREATE OR REPLACE VIEW public.wallets AS
SELECT
    wp.id,
    wp.user_id,
    -- THE MAGIC: Override the physical balance with the strict ledger truth
    COALESCE(vs.total_visible, 0)::numeric AS balance,
    wp.created_at,
    wp.updated_at,
    wp.locked_balance,
    wp.currency,
    COALESCE(vs.withdrawable, 0)::numeric AS withdrawable_balance,
    COALESCE(vs.float_balance, 0)::numeric AS float_balance,
    COALESCE(vs.advance_balance, 0)::numeric AS advance_balance
FROM public.wallets_physical wp
LEFT JOIN public.v_user_wallet_strict vs ON vs.user_id = wp.user_id;

-- 3. Ensure the frontend and edge functions have read access
GRANT SELECT ON public.wallets TO authenticated, anon, service_role;

-- 4. Create an INSTEAD OF trigger to intercept legacy backend INSERT/UPDATE statements
CREATE OR REPLACE FUNCTION public.wallets_view_dml()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Safely route new wallet creations to the physical table
        INSERT INTO public.wallets_physical (
            id, user_id, balance, created_at, updated_at, locked_balance, currency,
            withdrawable_balance, float_balance, advance_balance
        ) VALUES (
            COALESCE(NEW.id, gen_random_uuid()),
            NEW.user_id,
            COALESCE(NEW.balance, 0),
            COALESCE(NEW.created_at, now()),
            COALESCE(NEW.updated_at, now()),
            COALESCE(NEW.locked_balance, 0),
            COALESCE(NEW.currency, 'UGX'),
            COALESCE(NEW.withdrawable_balance, 0),
            COALESCE(NEW.float_balance, 0),
            COALESCE(NEW.advance_balance, 0)
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- LEDGER FORTRESS: We silently ignore attempts to UPDATE balance natively.
        -- We only allow metadata updates (currency, locked_balance)
        UPDATE public.wallets_physical
        SET 
            updated_at = now(),
            currency = NEW.currency,
            locked_balance = NEW.locked_balance
        WHERE id = OLD.id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        DELETE FROM public.wallets_physical WHERE id = OLD.id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Attach the trigger to the view
CREATE TRIGGER instead_of_wallets_dml
INSTEAD OF INSERT OR UPDATE OR DELETE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.wallets_view_dml();

-- 6. Trigger cache invalidation for PostgREST
NOTIFY pgrst, 'reload schema';
```

**Verification:**
After running the migration, verify that logging into any Agent or COO EVEN IN THE RECONCILIATION TABS OF THE CFO  dashboard perfectly reflects the neutralized ledger balances. No React code needs to be modified.

***
