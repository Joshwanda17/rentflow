-- Backend hard gate: every rent request must carry the property/tenant GPS pin.
CREATE OR REPLACE FUNCTION public.enforce_rent_request_gps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.request_latitude IS NULL OR NEW.request_longitude IS NULL THEN
      RAISE EXCEPTION 'RENT_REQUEST_GPS_REQUIRED: capture the property GPS at the house before posting this rent request'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.request_latitude IS NOT NULL AND NEW.request_latitude IS NULL)
       OR (OLD.request_longitude IS NOT NULL AND NEW.request_longitude IS NULL) THEN
      RAISE EXCEPTION 'RENT_REQUEST_GPS_REQUIRED: the property GPS on a rent request cannot be cleared'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.request_latitude IS NULL OR NEW.request_longitude IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Plausibility: the pin must sit inside Uganda (with a small border margin).
  IF NEW.request_latitude < -1.6 OR NEW.request_latitude > 4.3
     OR NEW.request_longitude < 29.4 OR NEW.request_longitude > 35.1 THEN
    RAISE EXCEPTION 'RENT_REQUEST_GPS_OUT_OF_RANGE: the captured GPS (%, %) is not inside Uganda — recapture it at the house',
      NEW.request_latitude, NEW.request_longitude
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_rent_request_gps ON public.rent_requests;
CREATE TRIGGER trg_enforce_rent_request_gps
  BEFORE INSERT OR UPDATE OF request_latitude, request_longitude ON public.rent_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rent_request_gps();

-- Renewals: inherit the original pin, fall back to the landlord's saved location,
-- and fail loudly (instead of inserting a GPS-less row) when neither exists.
CREATE OR REPLACE FUNCTION public.renew_rent_request(p_prev_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agent uuid := auth.uid();
  v_prev  public.rent_requests%ROWTYPE;
  v_new_id uuid;
  v_photo text;
  v_lat numeric;
  v_lng numeric;
BEGIN
  IF v_agent IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT * INTO v_prev FROM public.rent_requests WHERE id = p_prev_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PREVIOUS_REQUEST_NOT_FOUND'; END IF;
  IF v_prev.agent_id IS DISTINCT FROM v_agent THEN RAISE EXCEPTION 'NOT_YOUR_REQUEST'; END IF;
  IF v_prev.landlord_id IS NULL THEN RAISE EXCEPTION 'LANDLORD_MISSING'; END IF;

  v_lat := v_prev.request_latitude;
  v_lng := v_prev.request_longitude;

  IF v_lat IS NULL OR v_lng IS NULL THEN
    SELECT latitude, longitude INTO v_lat, v_lng
    FROM public.landlords WHERE id = v_prev.landlord_id;
  END IF;

  IF v_lat IS NULL OR v_lng IS NULL THEN
    RAISE EXCEPTION 'GPS_REQUIRED: no property GPS on record for this tenant — post a fresh rent request and capture the GPS at the house';
  END IF;

  -- Carry the freshest passport photo we have for this tenant.
  SELECT tenant_photo_url INTO v_photo
  FROM public.rent_requests
  WHERE tenant_id = v_prev.tenant_id
    AND tenant_photo_url IS NOT NULL
    AND btrim(tenant_photo_url) <> ''
  ORDER BY created_at DESC
  LIMIT 1;

  PERFORM set_config('app.bypass_daily_eligibility', 'true', true);

  INSERT INTO public.rent_requests (
    tenant_id, agent_id, landlord_id, lc1_id,
    rent_amount, duration_days,
    access_fee, request_fee, total_repayment, daily_repayment,
    status, house_category, tenant_no_smartphone,
    request_latitude, request_longitude,
    tenant_photo_url, registration_type,
    agent_guarantor_consent, agent_guarantor_consent_at, agent_guarantor_consent_version
  ) VALUES (
    v_prev.tenant_id, v_agent, v_prev.landlord_id, v_prev.lc1_id,
    v_prev.rent_amount, v_prev.duration_days,
    0, 0, 0, 0,
    'pending', v_prev.house_category, COALESCE(v_prev.tenant_no_smartphone, false),
    v_lat, v_lng,
    v_photo, 'renewal',
    true, now(), 'v1'
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$;