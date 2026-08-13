CREATE OR REPLACE FUNCTION public.ops_tenant_products_services_report(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from date;
  v_to date;
  v_days int;
  v_start timestamptz;
  v_end timestamptz;
  v_prev_start timestamptz;
  v_prev_end timestamptz;
  v_res jsonb;
BEGIN
  IF NOT public.ops_tps_report_authorized() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_to := COALESCE(p_to, (now() AT TIME ZONE 'Africa/Kampala')::date);
  v_from := COALESCE(p_from, v_to);
  IF v_from > v_to THEN
    SELECT v_to, v_from INTO v_from, v_to;
  END IF;
  v_days := (v_to - v_from) + 1;

  v_start := (v_from::timestamp AT TIME ZONE 'Africa/Kampala');
  v_end := ((v_to + 1)::timestamp AT TIME ZONE 'Africa/Kampala');
  v_prev_end := v_start;
  v_prev_start := ((v_from - v_days)::timestamp AT TIME ZONE 'Africa/Kampala');

  WITH tenants AS (
    SELECT p.id, p.created_at
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'tenant'::app_role
  ),
  cur AS (
    SELECT
      (SELECT count(*) FROM tenants t WHERE t.created_at >= v_start AND t.created_at < v_end) AS new_tenants,
      (SELECT count(*) FROM tenants t WHERE t.created_at < v_end) AS total_tenants,
      (SELECT count(*) FROM rent_requests rr WHERE rr.created_at >= v_start AND rr.created_at < v_end) AS applications,
      (SELECT count(*) FROM rent_requests rr WHERE rr.coo_reviewed_at >= v_start AND rr.coo_reviewed_at < v_end) AS accepted,
      (SELECT count(*) FROM rent_requests rr WHERE rr.status = 'rejected'
         AND COALESCE(rr.rejected_at, rr.updated_at) >= v_start
         AND COALESCE(rr.rejected_at, rr.updated_at) < v_end) AS rejected,
      (SELECT count(DISTINCT ac.tenant_id) FROM agent_collections ac
        WHERE ac.tenant_id IS NOT NULL AND ac.created_at >= v_start AND ac.created_at < v_end) AS active_tenants,
      (SELECT COALESCE(sum(ac.amount), 0) FROM agent_collections ac
        WHERE ac.created_at >= v_start AND ac.created_at < v_end) AS collected,
      (SELECT count(*) FROM agent_collections ac
        WHERE ac.created_at >= v_start AND ac.created_at < v_end) AS payments,
      (SELECT COALESCE(sum(lp.amount), 0) FROM landlord_payouts lp
        WHERE lp.created_at >= v_start AND lp.created_at < v_end) AS payables,
      (SELECT count(DISTINCT lp.tenant_id) FROM landlord_payouts lp
        WHERE lp.tenant_id IS NOT NULL AND lp.created_at >= v_start AND lp.created_at < v_end) AS payable_tenants
  ),
  prev AS (
    SELECT
      (SELECT count(*) FROM tenants t WHERE t.created_at >= v_prev_start AND t.created_at < v_prev_end) AS new_tenants,
      (SELECT count(*) FROM tenants t WHERE t.created_at < v_prev_end) AS total_tenants,
      (SELECT count(*) FROM rent_requests rr WHERE rr.created_at >= v_prev_start AND rr.created_at < v_prev_end) AS applications,
      (SELECT count(*) FROM rent_requests rr WHERE rr.coo_reviewed_at >= v_prev_start AND rr.coo_reviewed_at < v_prev_end) AS accepted,
      (SELECT count(*) FROM rent_requests rr WHERE rr.status = 'rejected'
         AND COALESCE(rr.rejected_at, rr.updated_at) >= v_prev_start
         AND COALESCE(rr.rejected_at, rr.updated_at) < v_prev_end) AS rejected,
      (SELECT count(DISTINCT ac.tenant_id) FROM agent_collections ac
        WHERE ac.tenant_id IS NOT NULL AND ac.created_at >= v_prev_start AND ac.created_at < v_prev_end) AS active_tenants,
      (SELECT COALESCE(sum(ac.amount), 0) FROM agent_collections ac
        WHERE ac.created_at >= v_prev_start AND ac.created_at < v_prev_end) AS collected,
      (SELECT count(*) FROM agent_collections ac
        WHERE ac.created_at >= v_prev_start AND ac.created_at < v_prev_end) AS payments,
      (SELECT COALESCE(sum(lp.amount), 0) FROM landlord_payouts lp
        WHERE lp.created_at >= v_prev_start AND lp.created_at < v_prev_end) AS payables,
      (SELECT count(DISTINCT lp.tenant_id) FROM landlord_payouts lp
        WHERE lp.tenant_id IS NOT NULL AND lp.created_at >= v_prev_start AND lp.created_at < v_prev_end) AS payable_tenants
  ),
  days AS (
    SELECT d::date AS day FROM generate_series(v_from, v_to, interval '1 day') d
  ),
  series AS (
    SELECT
      d.day,
      (SELECT count(*) FROM tenants t
        WHERE (t.created_at AT TIME ZONE 'Africa/Kampala')::date = d.day) AS new_tenants,
      (SELECT count(*) FROM rent_requests rr
        WHERE (rr.created_at AT TIME ZONE 'Africa/Kampala')::date = d.day) AS applications,
      (SELECT count(*) FROM rent_requests rr
        WHERE (rr.coo_reviewed_at AT TIME ZONE 'Africa/Kampala')::date = d.day) AS accepted,
      (SELECT count(*) FROM rent_requests rr
        WHERE rr.status = 'rejected'
          AND (COALESCE(rr.rejected_at, rr.updated_at) AT TIME ZONE 'Africa/Kampala')::date = d.day) AS rejected,
      (SELECT count(DISTINCT ac.tenant_id) FROM agent_collections ac
        WHERE ac.tenant_id IS NOT NULL
          AND (ac.created_at AT TIME ZONE 'Africa/Kampala')::date = d.day) AS paid_tenants,
      (SELECT COALESCE(sum(ac.amount), 0) FROM agent_collections ac
        WHERE (ac.created_at AT TIME ZONE 'Africa/Kampala')::date = d.day) AS collected,
      (SELECT COALESCE(sum(lp.amount), 0) FROM landlord_payouts lp
        WHERE (lp.created_at AT TIME ZONE 'Africa/Kampala')::date = d.day) AS payables
    FROM days d
  ),
  app_status AS (
    SELECT rr.status, count(*) AS n
    FROM rent_requests rr
    WHERE rr.created_at >= v_start AND rr.created_at < v_end
    GROUP BY rr.status
  ),
  districts AS (
    SELECT COALESCE(b.district, 'Unmapped') AS district,
           count(DISTINCT ac.tenant_id) AS paying_tenants,
           COALESCE(sum(ac.amount), 0) AS collected
    FROM agent_collections ac
    LEFT JOIN v_tenant_ops_tenant_base b ON b.tenant_id = ac.tenant_id
    WHERE ac.created_at >= v_start AND ac.created_at < v_end
    GROUP BY 1
    ORDER BY collected DESC
    LIMIT 12
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object(
      'from', v_from, 'to', v_to, 'days', v_days, 'timezone', 'Africa/Kampala',
      'start_at', v_start, 'end_at', v_end,
      'previous_from', (v_from - v_days), 'previous_to', (v_from - 1),
      'previous_start_at', v_prev_start, 'previous_end_at', v_prev_end
    ),
    'current', (SELECT to_jsonb(c) FROM cur c),
    'previous', (SELECT to_jsonb(p) FROM prev p),
    'outstanding_payables', (SELECT COALESCE(sum(lp.amount), 0) FROM landlord_payouts lp WHERE lp.status <> 'completed'),
    'outstanding_payables_count', (SELECT count(*) FROM landlord_payouts lp WHERE lp.status <> 'completed'),
    'tenant_register_total', (SELECT count(*) FROM tenants),
    'series', (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.day), '[]'::jsonb) FROM series s),
    'application_status', (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.n DESC), '[]'::jsonb) FROM app_status a),
    'districts', (SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb) FROM districts d),
    'generated_at', to_jsonb(now())
  ) INTO v_res;

  RETURN v_res;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ops_tenant_products_services_rows(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_agent uuid DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_payment text DEFAULT 'all',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  tenant_id uuid,
  tenant_name text,
  tenant_phone text,
  district text,
  region text,
  agent_id uuid,
  agent_name text,
  tenant_created_at timestamptz,
  is_new_in_period boolean,
  application_status text,
  applied_in_period boolean,
  accepted_in_period boolean,
  rejected_in_period boolean,
  paid_in_period numeric,
  payments_in_period int,
  last_payment_at timestamptz,
  rent_amount numeric,
  daily_repayment numeric,
  outstanding numeric,
  payables_in_period numeric,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from date;
  v_to date;
  v_start timestamptz;
  v_end timestamptz;
  v_search text;
BEGIN
  IF NOT public.ops_tps_report_authorized() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_to := COALESCE(p_to, (now() AT TIME ZONE 'Africa/Kampala')::date);
  v_from := COALESCE(p_from, v_to);
  IF v_from > v_to THEN
    SELECT v_to, v_from INTO v_from, v_to;
  END IF;
  v_start := (v_from::timestamp AT TIME ZONE 'Africa/Kampala');
  v_end := ((v_to + 1)::timestamp AT TIME ZONE 'Africa/Kampala');
  v_search := NULLIF(btrim(COALESCE(p_search, '')), '');

  RETURN QUERY
  WITH pay AS (
    SELECT ac.tenant_id,
           sum(ac.amount) AS amt,
           count(*)::int AS entries,
           max(ac.created_at) AS last_at
    FROM agent_collections ac
    WHERE ac.tenant_id IS NOT NULL AND ac.created_at >= v_start AND ac.created_at < v_end
    GROUP BY ac.tenant_id
  ),
  reqs AS (
    SELECT rr.tenant_id,
           bool_or(rr.created_at >= v_start AND rr.created_at < v_end) AS applied,
           bool_or(rr.coo_reviewed_at >= v_start AND rr.coo_reviewed_at < v_end) AS accepted,
           bool_or(rr.status = 'rejected'
             AND COALESCE(rr.rejected_at, rr.updated_at) >= v_start
             AND COALESCE(rr.rejected_at, rr.updated_at) < v_end) AS rejected
    FROM rent_requests rr
    WHERE rr.tenant_id IS NOT NULL
    GROUP BY rr.tenant_id
  ),
  payb AS (
    SELECT lp.tenant_id, COALESCE(sum(lp.amount), 0) AS amt
    FROM landlord_payouts lp
    WHERE lp.tenant_id IS NOT NULL AND lp.created_at >= v_start AND lp.created_at < v_end
    GROUP BY lp.tenant_id
  ),
  base AS (
    SELECT
      t.tenant_id,
      t.tenant_name,
      t.tenant_phone,
      t.district,
      t.region,
      t.agent_id,
      ap.full_name AS agent_name,
      t.tenant_created_at,
      (t.tenant_created_at >= v_start AND t.tenant_created_at < v_end) AS is_new_in_period,
      b.rr_status AS application_status,
      COALESCE(r.applied, false) AS applied,
      COALESCE(r.accepted, false) AS accepted,
      COALESCE(r.rejected, false) AS rejected,
      COALESCE(p.amt, 0) AS paid_amt,
      COALESCE(p.entries, 0) AS pay_entries,
      p.last_at,
      COALESCE(b.rent_amount, 0) AS rent_amount,
      COALESCE(b.daily_repayment, 0) AS daily_repayment,
      COALESCE(b.outstanding, 0) AS outstanding,
      COALESCE(pb.amt, 0) AS payables_amt
    FROM v_tenant_location_pivot t
    LEFT JOIN v_tenant_ops_tenant_base b ON b.tenant_id = t.tenant_id
    LEFT JOIN pay p ON p.tenant_id = t.tenant_id
    LEFT JOIN reqs r ON r.tenant_id = t.tenant_id
    LEFT JOIN payb pb ON pb.tenant_id = t.tenant_id
    LEFT JOIN profiles ap ON ap.id = t.agent_id
    WHERE (
      (t.tenant_created_at >= v_start AND t.tenant_created_at < v_end)
      OR p.tenant_id IS NOT NULL
      OR COALESCE(r.applied, false) OR COALESCE(r.accepted, false) OR COALESCE(r.rejected, false)
      OR pb.tenant_id IS NOT NULL
    )
  ),
  filtered AS (
    SELECT * FROM base bb
    WHERE (p_district IS NULL OR p_district = 'all' OR bb.district = p_district)
      AND (p_agent IS NULL OR bb.agent_id = p_agent)
      AND (p_status IS NULL OR p_status = 'all' OR bb.application_status = p_status)
      AND (
        p_payment IS NULL OR p_payment = 'all'
        OR (p_payment = 'paid' AND bb.paid_amt > 0)
        OR (p_payment = 'unpaid' AND bb.paid_amt = 0)
      )
      AND (
        v_search IS NULL
        OR bb.tenant_name ILIKE '%' || v_search || '%'
        OR COALESCE(bb.tenant_phone, '') ILIKE '%' || v_search || '%'
        OR COALESCE(bb.agent_name, '') ILIKE '%' || v_search || '%'
        OR COALESCE(bb.district, '') ILIKE '%' || v_search || '%'
      )
  ),
  counted AS (SELECT count(*) AS n FROM filtered)
  SELECT
    f.tenant_id, f.tenant_name, f.tenant_phone, f.district, f.region,
    f.agent_id, f.agent_name, f.tenant_created_at, f.is_new_in_period,
    f.application_status, f.applied, f.accepted, f.rejected,
    f.paid_amt, f.pay_entries, f.last_at,
    f.rent_amount, f.daily_repayment, f.outstanding, f.payables_amt,
    (SELECT n FROM counted) AS total_count
  FROM filtered f
  ORDER BY f.paid_amt DESC, f.tenant_created_at DESC NULLS LAST, f.tenant_name
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 5000))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$function$;