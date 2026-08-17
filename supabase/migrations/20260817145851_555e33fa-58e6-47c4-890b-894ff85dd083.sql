-- 1) Guard: decided requests cannot be resurrected, and only Ops can decide.
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

  -- A verified or dismissed request is final; it can never go back to the queue.
  IF OLD.status IN ('verified', 'cancelled') AND NEW.status = 'pending' THEN
    RAISE EXCEPTION 'Verification request % is already % and cannot be reopened', OLD.id, OLD.status
      USING ERRCODE = '42501';
  END IF;

  -- Only Ops (or the SECURITY DEFINER decision RPC acting for an Ops user) may decide.
  IF NEW.status IN ('verified', 'rejected') AND NOT public.is_ops_role(auth.uid()) THEN
    RAISE EXCEPTION 'Only Landlord Operations can decide verification request %', OLD.id
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_landlord_verification_request_status ON public.landlord_verification_requests;
CREATE TRIGGER trg_guard_landlord_verification_request_status
  BEFORE UPDATE ON public.landlord_verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_landlord_verification_request_status();

-- 2) Single source of truth: a pending request means the landlord is under review.
CREATE OR REPLACE FUNCTION public.sync_landlord_state_on_verification_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_reason text;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT verification_status, verification_reason
    INTO v_status, v_reason
  FROM public.landlords
  WHERE id = NEW.landlord_id
  FOR UPDATE;

  -- Only a rejected landlord is reopened. Verified landlords stay verified
  -- (phone-change / re-check requests must not undo a verification).
  IF v_status IS DISTINCT FROM 'rejected' THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('landlord_verification.sync_authorized', 'true', true);
  UPDATE public.landlords
  SET verification_status = 'pending',
      verification_reason = left(
        'Resubmitted for review by the requesting agent. Previous rejection: '
          || COALESCE(NULLIF(btrim(v_reason), ''), 'no reason recorded'), 500),
      verification_source = 'agent_request_resubmit',
      verified = false
  WHERE id = NEW.landlord_id;
  PERFORM set_config('landlord_verification.sync_authorized', 'false', true);

  INSERT INTO public.audit_logs(user_id, action_type, table_name, record_id, metadata)
  VALUES (
    COALESCE(auth.uid(), NEW.requested_by),
    'landlord_verification_reopened',
    'landlords',
    NEW.landlord_id,
    jsonb_build_object(
      'request_id', NEW.id,
      'previous_status', v_status,
      'previous_reason', v_reason,
      'reason', 'Landlord returned to review because a pending verification request was submitted'
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_landlord_state_on_verification_request ON public.landlord_verification_requests;
CREATE TRIGGER trg_sync_landlord_state_on_verification_request
  AFTER INSERT OR UPDATE OF status ON public.landlord_verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_landlord_state_on_verification_request();