CREATE OR REPLACE FUNCTION public.guard_landlord_verification_request_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('verified', 'cancelled') AND NEW.status = 'pending' THEN
    RAISE EXCEPTION 'Verification request % is already % and cannot be reopened', OLD.id, OLD.status
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IN ('verified', 'rejected')
     AND NOT public.is_ops_role(auth.uid())
     AND NOT (auth.uid() IS NULL AND current_user IN ('postgres', 'service_role', 'supabase_admin')) THEN
    RAISE EXCEPTION 'Only Landlord Operations can decide verification request %', OLD.id
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;