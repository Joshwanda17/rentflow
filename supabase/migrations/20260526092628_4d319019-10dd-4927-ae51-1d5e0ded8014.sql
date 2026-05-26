
-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_geo
  ON public.profiles (country, district, city);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at
  ON public.profiles (created_at);
CREATE INDEX IF NOT EXISTS idx_landlords_geo
  ON public.landlords (country, district, town_council);
CREATE INDEX IF NOT EXISTS idx_landlords_created_at
  ON public.landlords (created_at);
CREATE INDEX IF NOT EXISTS idx_rent_requests_landlord_status
  ON public.rent_requests (landlord_id, status, created_at DESC);

-- Cache table
CREATE TABLE IF NOT EXISTS public.geo_coverage_cache (
  cache_key   text PRIMARY KEY,
  payload     jsonb NOT NULL,
  total_count integer NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_geo_coverage_cache_expires
  ON public.geo_coverage_cache (expires_at);
ALTER TABLE public.geo_coverage_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.geo_coverage_cache FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public._geo_cache_key(
  p_kind text, p_country text, p_district text, p_city text,
  p_from timestamptz, p_to timestamptz, p_roles text[]
) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT md5(concat_ws('|',
    p_kind,
    COALESCE(public._geo_norm(p_country),''),
    COALESCE(public._geo_norm(p_district),''),
    COALESCE(public._geo_norm(p_city),''),
    COALESCE(p_from::text,''),
    COALESCE(p_to::text,''),
    COALESCE(array_to_string((SELECT array_agg(x ORDER BY x) FROM unnest(p_roles) x), ','), 'ALL')
  ));
$$;

DROP FUNCTION IF EXISTS public.get_geo_user_coverage(text,text,text,timestamptz,timestamptz,text[]);

CREATE OR REPLACE FUNCTION public.get_geo_user_coverage(
  p_country  text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_city     text DEFAULT NULL,
  p_from     timestamptz DEFAULT NULL,
  p_to       timestamptz DEFAULT NULL,
  p_roles    text[]      DEFAULT NULL,
  p_limit    int  DEFAULT 100,
  p_offset   int  DEFAULT 0
)
RETURNS TABLE (
  level          text,
  bucket         text,
  tenants        bigint,
  landlords      bigint,
  funders        bigint,
  agents         bigint,
  funded_tenants bigint,
  total_buckets  bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_country  text := public._geo_norm(p_country);
  v_district text := public._geo_norm(p_district);
  v_city     text := public._geo_norm(p_city);
  v_level    text;
  v_roles    text[] := COALESCE(p_roles, ARRAY['tenant','landlord','funder','agent']);
  v_key      text   := public._geo_cache_key('coverage', p_country, p_district, p_city, p_from, p_to, p_roles);
  v_payload  jsonb;
  v_total    bigint;
  v_limit    int := GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
  v_offset   int := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  IF NOT public._geo_coverage_caller_allowed() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_level := CASE
    WHEN v_country IS NULL  THEN 'country'
    WHEN v_district IS NULL THEN 'district'
    ELSE 'city'
  END;

  SELECT c.payload, c.total_count INTO v_payload, v_total
  FROM public.geo_coverage_cache c
  WHERE c.cache_key = v_key AND c.expires_at > now();

  IF v_payload IS NULL THEN
    WITH
    user_geo AS (
      SELECT
        ur.role::text AS role,
        public._geo_norm(p.country)  AS country,
        public._geo_norm(p.district) AS district,
        public._geo_norm(p.city)     AS city,
        p.id AS user_id,
        p.created_at AS created_at
      FROM public.user_roles ur
      JOIN public.profiles  p ON p.id = ur.user_id
      WHERE ur.role IN ('tenant','supporter','agent')
    ),
    landlord_geo AS (
      SELECT
        public._geo_norm(l.country)      AS country,
        public._geo_norm(l.district)     AS district,
        public._geo_norm(l.town_council) AS city,
        l.id AS landlord_id,
        l.created_at AS created_at
      FROM public.landlords l
    ),
    funded_landlord_ids AS (
      SELECT DISTINCT rr.landlord_id
      FROM public.rent_requests rr
      WHERE rr.landlord_id IS NOT NULL
        AND rr.status IN ('funded','repaying','completed')
        AND (p_from IS NULL OR rr.created_at >= p_from)
        AND (p_to   IS NULL OR rr.created_at <= p_to)
    ),
    funded_tenant_geo AS (
      SELECT DISTINCT
        rr.tenant_id,
        public._geo_norm(p.country)  AS country,
        public._geo_norm(p.district) AS district,
        public._geo_norm(p.city)     AS city
      FROM public.rent_requests rr
      JOIN public.profiles p ON p.id = rr.tenant_id
      WHERE rr.landlord_id IN (SELECT landlord_id FROM funded_landlord_ids)
    ),
    src AS (
      SELECT
        CASE ug.role WHEN 'tenant' THEN 'tenant'
                     WHEN 'supporter' THEN 'funder'
                     WHEN 'agent' THEN 'agent' END AS s,
        CASE v_level
          WHEN 'country'  THEN COALESCE(ug.country,  'Unknown')
          WHEN 'district' THEN COALESCE(ug.district, 'Unknown')
          ELSE                  COALESCE(ug.city,     'Unknown')
        END AS bucket
      FROM user_geo ug
      WHERE (v_country  IS NULL OR ug.country  = v_country)
        AND (v_district IS NULL OR ug.district = v_district)
        AND (v_city     IS NULL OR ug.city     = v_city)
        AND (p_from IS NULL OR ug.created_at >= p_from)
        AND (p_to   IS NULL OR ug.created_at <= p_to)
        AND (
          (ug.role = 'tenant'    AND 'tenant'  = ANY(v_roles)) OR
          (ug.role = 'supporter' AND 'funder'  = ANY(v_roles)) OR
          (ug.role = 'agent'     AND 'agent'   = ANY(v_roles))
        )
      UNION ALL
      SELECT 'landlord',
        CASE v_level
          WHEN 'country'  THEN COALESCE(lg.country,  'Unknown')
          WHEN 'district' THEN COALESCE(lg.district, 'Unknown')
          ELSE                  COALESCE(lg.city,     'Unknown')
        END
      FROM landlord_geo lg
      WHERE 'landlord' = ANY(v_roles)
        AND (v_country  IS NULL OR lg.country  = v_country)
        AND (v_district IS NULL OR lg.district = v_district)
        AND (v_city     IS NULL OR lg.city     = v_city)
        AND (p_from IS NULL OR lg.created_at >= p_from)
        AND (p_to   IS NULL OR lg.created_at <= p_to)
      UNION ALL
      SELECT 'funded_tenant',
        CASE v_level
          WHEN 'country'  THEN COALESCE(ft.country,  'Unknown')
          WHEN 'district' THEN COALESCE(ft.district, 'Unknown')
          ELSE                  COALESCE(ft.city,     'Unknown')
        END
      FROM funded_tenant_geo ft
      WHERE (v_country  IS NULL OR ft.country  = v_country)
        AND (v_district IS NULL OR ft.district = v_district)
        AND (v_city     IS NULL OR ft.city     = v_city)
    ),
    agg AS (
      SELECT
        bucket,
        COALESCE(SUM(CASE WHEN s='tenant'        THEN 1 END),0)::bigint AS tenants,
        COALESCE(SUM(CASE WHEN s='landlord'      THEN 1 END),0)::bigint AS landlords,
        COALESCE(SUM(CASE WHEN s='funder'        THEN 1 END),0)::bigint AS funders,
        COALESCE(SUM(CASE WHEN s='agent'         THEN 1 END),0)::bigint AS agents,
        COALESCE(SUM(CASE WHEN s='funded_tenant' THEN 1 END),0)::bigint AS funded_tenants
      FROM src
      GROUP BY bucket
    )
    SELECT
      COALESCE(jsonb_agg(
        jsonb_build_object(
          'bucket', bucket,
          'tenants', tenants,
          'landlords', landlords,
          'funders', funders,
          'agents', agents,
          'funded_tenants', funded_tenants
        )
        ORDER BY (tenants + landlords + funders + agents + funded_tenants) DESC, bucket
      ), '[]'::jsonb),
      COUNT(*)::bigint
    INTO v_payload, v_total
    FROM agg;

    INSERT INTO public.geo_coverage_cache (cache_key, payload, total_count, expires_at)
    VALUES (v_key, v_payload, v_total::int, now() + interval '5 minutes')
    ON CONFLICT (cache_key) DO UPDATE
      SET payload     = EXCLUDED.payload,
          total_count = EXCLUDED.total_count,
          expires_at  = EXCLUDED.expires_at,
          created_at  = now();
  END IF;

  RETURN QUERY
  SELECT
    v_level                          AS level,
    (r->>'bucket')::text             AS bucket,
    (r->>'tenants')::bigint          AS tenants,
    (r->>'landlords')::bigint        AS landlords,
    (r->>'funders')::bigint          AS funders,
    (r->>'agents')::bigint           AS agents,
    (r->>'funded_tenants')::bigint   AS funded_tenants,
    v_total                          AS total_buckets
  FROM jsonb_array_elements(v_payload) WITH ORDINALITY AS t(r, ord)
  WHERE t.ord > v_offset AND t.ord <= v_offset + v_limit
  ORDER BY t.ord;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_geo_user_coverage(
  text,text,text,timestamptz,timestamptz,text[],int,int
) TO authenticated;

DROP FUNCTION IF EXISTS public.get_funded_tenants_at(text,text,text,timestamptz,timestamptz,int,int);

CREATE OR REPLACE FUNCTION public.get_funded_tenants_at(
  p_country  text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_city     text DEFAULT NULL,
  p_from     timestamptz DEFAULT NULL,
  p_to       timestamptz DEFAULT NULL,
  p_limit    int  DEFAULT 100,
  p_offset   int  DEFAULT 0
)
RETURNS TABLE (
  tenant_id          uuid,
  tenant_name        text,
  tenant_phone       text,
  tenant_country     text,
  tenant_district    text,
  tenant_city        text,
  landlord_id        uuid,
  landlord_name      text,
  latest_status      text,
  latest_rent_amount numeric,
  rent_request_id    uuid,
  total_count        bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_country  text := public._geo_norm(p_country);
  v_district text := public._geo_norm(p_district);
  v_city     text := public._geo_norm(p_city);
  v_limit    int  := GREATEST(1, LEAST(COALESCE(p_limit,100), 500));
  v_offset   int  := GREATEST(0, COALESCE(p_offset,0));
BEGIN
  IF NOT public._geo_coverage_caller_allowed() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH funded_rr AS (
    SELECT DISTINCT ON (rr.tenant_id, rr.landlord_id)
      rr.id, rr.tenant_id, rr.landlord_id, rr.status, rr.rent_amount, rr.created_at
    FROM public.rent_requests rr
    WHERE rr.tenant_id IS NOT NULL
      AND rr.landlord_id IS NOT NULL
      AND rr.status IN ('funded','repaying','completed')
      AND (p_from IS NULL OR rr.created_at >= p_from)
      AND (p_to   IS NULL OR rr.created_at <= p_to)
    ORDER BY rr.tenant_id, rr.landlord_id, rr.created_at DESC
  ),
  scoped AS (
    SELECT
      p.id  AS tenant_id,
      p.full_name AS tenant_name,
      p.phone     AS tenant_phone,
      public._geo_norm(p.country)  AS tenant_country,
      public._geo_norm(p.district) AS tenant_district,
      public._geo_norm(p.city)     AS tenant_city,
      l.id   AS landlord_id,
      l.name AS landlord_name,
      fr.status AS latest_status,
      fr.rent_amount AS latest_rent_amount,
      fr.id  AS rent_request_id,
      fr.created_at
    FROM funded_rr fr
    JOIN public.profiles  p ON p.id = fr.tenant_id
    LEFT JOIN public.landlords l ON l.id = fr.landlord_id
    WHERE (v_country  IS NULL OR public._geo_norm(p.country)  = v_country)
      AND (v_district IS NULL OR public._geo_norm(p.district) = v_district)
      AND (v_city     IS NULL OR public._geo_norm(p.city)     = v_city)
  )
  SELECT
    s.tenant_id, s.tenant_name, s.tenant_phone,
    s.tenant_country, s.tenant_district, s.tenant_city,
    s.landlord_id, s.landlord_name,
    s.latest_status, s.latest_rent_amount, s.rent_request_id,
    COUNT(*) OVER ()::bigint AS total_count
  FROM scoped s
  ORDER BY s.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_funded_tenants_at(
  text,text,text,timestamptz,timestamptz,int,int
) TO authenticated;

CREATE OR REPLACE FUNCTION public.purge_geo_coverage_cache()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_deleted int;
BEGIN
  DELETE FROM public.geo_coverage_cache WHERE expires_at < now() - interval '10 minutes';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('purge_geo_coverage_cache');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule(
      'purge_geo_coverage_cache',
      '*/15 * * * *',
      $cron$ SELECT public.purge_geo_coverage_cache(); $cron$
    );
  END IF;
END $$;
