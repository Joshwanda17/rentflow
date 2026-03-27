CREATE OR REPLACE FUNCTION public.trg_auto_log_fee_revenue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'funded' AND (OLD.status IS NULL OR OLD.status != 'funded') THEN
    IF COALESCE(NEW.access_fee, 0) > 0 THEN
      INSERT INTO public.fee_revenue_ledger (rent_request_id, tenant_id, fee_type, total_amount, deferred_amount, status)
      VALUES (NEW.id, NEW.tenant_id, 'access_fee', NEW.access_fee, NEW.access_fee, 'deferred');
    END IF;
    IF COALESCE(NEW.request_fee, 0) > 0 THEN
      INSERT INTO public.fee_revenue_ledger (rent_request_id, tenant_id, fee_type, total_amount, deferred_amount, status)
      VALUES (NEW.id, NEW.tenant_id, 'platform_fee', NEW.request_fee, NEW.request_fee, 'deferred');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;