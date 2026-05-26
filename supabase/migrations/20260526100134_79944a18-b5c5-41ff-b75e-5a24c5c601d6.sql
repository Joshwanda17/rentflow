CREATE OR REPLACE FUNCTION public.get_agent_geo_breakdown(
  p_country  text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_city     text DEFAULT NULL,
  p_limit    int  DEFAULT 200,
  p_offset   int  DEFAULT 0
)
RETURNS TABLE(
  agent_id          uuid,
  agent_name        text,
  agent_phone       text,
  agent_country     text,
  agent_district    text,
  agent_city        text,
  tenants_count     bigint,
  landlords_count   bigint,
  partners_count    bigint,
  total_count       bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_country  text := public._geo_norm(p_country);
  v_district text := public._geo_norm(p_district);
  v_city     text := public._geo_norm(p_city);
  v_limit    int  := GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000));
  v_offset   int  := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  IF NOT public._geo_coverage_caller_allowed() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH agents AS (
    SELECT
      p.id          AS agent_id,
      p.full_name   AS agent_name,
      p.phone       AS agent_phone,
      public._geo_norm(p.country)  AS agent_country,
      public._geo_norm(p.district) AS agent_district,
      public._geo_norm(p.city)     AS agent_city
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'agent'
      AND (v_country  IS NULL OR public._geo_norm(p.country)  = v_country)
      AND (v_district IS NULL OR public._geo_norm(p.district) = v_district)
      AND (v_city     IS NULL OR public._geo_norm(p.city)     = v_city)
  ),
  -- Tenants referred by each agent (role=tenant + profiles.referrer_id)
  agent_tenants AS (
    SELECT p.referrer_id AS agent_id, COUNT(DISTINCT p.id) AS cnt
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'tenant'
    WHERE p.referrer_id IS NOT NULL
    GROUP BY p.referrer_id
  ),
  -- Landlords registered by an agent
  agent_landlords AS (
    SELECT l.registered_by AS agent_id, COUNT(DISTINCT l.id) AS cnt
    FROM public.landlords l
    WHERE l.registered_by IS NOT NULL
    GROUP BY l.registered_by
  ),
  -- Partners = supporters referred by the agent
  agent_partners AS (
    SELECT p.referrer_id AS agent_id, COUNT(DISTINCT p.id) AS cnt
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'supporter'
    WHERE p.referrer_id IS NOT NULL
    GROUP BY p.referrer_id
  ),
  joined AS (
    SELECT
      a.agent_id, a.agent_name, a.agent_phone,
      a.agent_country, a.agent_district, a.agent_city,
      COALESCE(t.cnt, 0)::bigint  AS tenants_count,
      COALESCE(l.cnt, 0)::bigint  AS landlords_count,
      COALESCE(pp.cnt, 0)::bigint AS partners_count
    FROM agents a
    LEFT JOIN agent_tenants   t  ON t.agent_id  = a.agent_id
    LEFT JOIN agent_landlords l  ON l.agent_id  = a.agent_id
    LEFT JOIN agent_partners  pp ON pp.agent_id = a.agent_id
  )
  SELECT
    j.agent_id, j.agent_name, j.agent_phone,
    j.agent_country, j.agent_district, j.agent_city,
    j.tenants_count, j.landlords_count, j.partners_count,
    COUNT(*) OVER ()::bigint AS total_count
  FROM joined j
  ORDER BY (j.tenants_count + j.landlords_count + j.partners_count) DESC,
           j.agent_name NULLS LAST
  LIMIT v_limit OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_agent_geo_breakdown(text,text,text,int,int) TO authenticated;