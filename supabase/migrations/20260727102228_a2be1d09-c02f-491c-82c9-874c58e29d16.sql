-- Block the retired UGX 1,000 instant house-listed reward at the DB boundary.
-- The reward was retired on 2026-07-23; the full UGX 5,000 is paid by
-- credit-listing-bonus after Landlord Ops verification. Any attempt to insert
-- ledger legs for the retired reward now raises so the money cannot leak
-- regardless of which caller (edge function, trigger, or client) emits it.
CREATE OR REPLACE FUNCTION public.block_retired_instant_house_reward()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.description ILIKE '%instant house-listed reward%' THEN
    RAISE EXCEPTION 'Retired reward blocked: the UGX 1,000 instant house-listed reward was retired on 2026-07-23. Full UGX 5,000 is paid by credit-listing-bonus after verification. (source_table=%, source_id=%)',
      NEW.source_table, NEW.source_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_block_retired_instant_house_reward ON public.general_ledger;
CREATE TRIGGER trg_block_retired_instant_house_reward
  BEFORE INSERT ON public.general_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.block_retired_instant_house_reward();
