-- =====================================================================
-- Tenant-scoped document custody + renewal carry-forward
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.tenant_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  doc_type text NOT NULL CHECK (doc_type IN ('tenant_passport','lc_letter','house_image')),
  bucket text NOT NULL,
  path text,
  public_url text,
  source_rent_request_id uuid,
  version integer NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  uploaded_by uuid,
  verified_by uuid,
  verified_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_documents TO authenticated;
GRANT ALL ON public.tenant_documents TO service_role;

ALTER TABLE public.tenant_documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tenant_documents_tenant ON public.tenant_documents(tenant_id, doc_type, is_current);
CREATE INDEX IF NOT EXISTS idx_tenant_documents_source ON public.tenant_documents(source_rent_request_id);

-- Same artefact must not be registered twice for the same tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_documents_artifact
  ON public.tenant_documents(tenant_id, doc_type, bucket, COALESCE(path, public_url));

-- Helper: is the caller an ops/exec/admin reviewer?
CREATE OR REPLACE FUNCTION public.can_manage_tenant_documents(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('manager','super_admin','admin','ceo','coo','cfo',
                      'operations','tenant_ops','agent_ops','landlord_ops',
                      'financial_ops','partner_ops','crm','hr')
  );
$$;

CREATE POLICY "Tenant reads own documents"
  ON public.tenant_documents FOR SELECT TO authenticated
  USING (tenant_id = auth.uid());

CREATE POLICY "Custodian agent reads tenant documents"
  ON public.tenant_documents FOR SELECT TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.rent_requests rr
      WHERE rr.tenant_id = public.tenant_documents.tenant_id
        AND rr.agent_id = auth.uid()
    )
  );

CREATE POLICY "Staff read all tenant documents"
  ON public.tenant_documents FOR SELECT TO authenticated
  USING (public.can_manage_tenant_documents(auth.uid()));

CREATE POLICY "Custodian agent or staff writes tenant documents"
  ON public.tenant_documents FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    OR public.can_manage_tenant_documents(auth.uid())
  );

CREATE POLICY "Custodian agent or staff updates tenant documents"
  ON public.tenant_documents FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid() OR public.can_manage_tenant_documents(auth.uid()))
  WITH CHECK (uploaded_by = auth.uid() OR public.can_manage_tenant_documents(auth.uid()));

CREATE POLICY "Only staff delete tenant documents"
  ON public.tenant_documents FOR DELETE TO authenticated
  USING (public.can_manage_tenant_documents(auth.uid()));

CREATE TRIGGER trg_tenant_documents_updated_at
  BEFORE UPDATE ON public.tenant_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- Registrar: record a document against the tenant (idempotent, versioned)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_tenant_document(
  p_tenant_id uuid,
  p_doc_type text,
  p_bucket text,
  p_path text,
  p_public_url text,
  p_source_rent_request_id uuid,
  p_uploaded_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_next integer;
BEGIN
  IF p_tenant_id IS NULL OR p_doc_type IS NULL THEN
    RETURN NULL;
  END IF;
  IF COALESCE(p_path, p_public_url) IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id
    FROM public.tenant_documents
   WHERE tenant_id = p_tenant_id
     AND doc_type = p_doc_type
     AND bucket = p_bucket
     AND COALESCE(path, public_url) = COALESCE(p_path, p_public_url);

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
    FROM public.tenant_documents
   WHERE tenant_id = p_tenant_id AND doc_type = p_doc_type;

  -- A new passport / LC letter supersedes the previous one; house images stack.
  IF p_doc_type IN ('tenant_passport','lc_letter') THEN
    UPDATE public.tenant_documents
       SET is_current = false
     WHERE tenant_id = p_tenant_id AND doc_type = p_doc_type AND is_current;
  END IF;

  INSERT INTO public.tenant_documents
    (tenant_id, doc_type, bucket, path, public_url, source_rent_request_id,
     version, is_current, uploaded_by)
  VALUES
    (p_tenant_id, p_doc_type, p_bucket, p_path, p_public_url, p_source_rent_request_id,
     v_next, true, p_uploaded_by)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_tenant_document(uuid,text,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_tenant_document(uuid,text,text,text,text,uuid,uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Carry-forward: a brand-new rent request inherits the tenant's docs.
-- Name starts with trg_a_ so it fires BEFORE trg_enforce_rent_request_tenant_photo.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.carry_forward_tenant_documents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_photo text;
  v_lc RECORD;
  v_images text[];
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.tenant_photo_url IS NULL OR btrim(NEW.tenant_photo_url) = '' THEN
    SELECT COALESCE(public_url, path) INTO v_photo
      FROM public.tenant_documents
     WHERE tenant_id = NEW.tenant_id AND doc_type = 'tenant_passport'
     ORDER BY is_current DESC, version DESC, created_at DESC
     LIMIT 1;
    IF v_photo IS NOT NULL THEN
      NEW.tenant_photo_url := v_photo;
    END IF;
  END IF;

  IF NEW.lc_letter_path IS NULL OR btrim(NEW.lc_letter_path) = '' THEN
    SELECT bucket, path INTO v_lc
      FROM public.tenant_documents
     WHERE tenant_id = NEW.tenant_id AND doc_type = 'lc_letter' AND path IS NOT NULL
     ORDER BY is_current DESC, version DESC, created_at DESC
     LIMIT 1;
    IF v_lc.path IS NOT NULL THEN
      NEW.lc_letter_path := v_lc.path;
      NEW.lc_letter_bucket := v_lc.bucket;
    END IF;
  END IF;

  IF NEW.house_image_urls IS NULL OR array_length(NEW.house_image_urls, 1) IS NULL THEN
    SELECT array_agg(u ORDER BY u) INTO v_images
      FROM (
        SELECT DISTINCT COALESCE(public_url, path) AS u
          FROM public.tenant_documents
         WHERE tenant_id = NEW.tenant_id AND doc_type = 'house_image'
         LIMIT 10
      ) s
     WHERE u IS NOT NULL;
    IF v_images IS NOT NULL AND array_length(v_images, 1) > 0 THEN
      NEW.house_image_urls := v_images;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_a_carry_forward_tenant_documents ON public.rent_requests;
CREATE TRIGGER trg_a_carry_forward_tenant_documents
  BEFORE INSERT ON public.rent_requests
  FOR EACH ROW EXECUTE FUNCTION public.carry_forward_tenant_documents();

-- ---------------------------------------------------------------------
-- Registrar trigger: whatever lands on a rent request is recorded on the tenant
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_rent_request_tenant_documents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.tenant_photo_url IS NOT NULL AND btrim(NEW.tenant_photo_url) <> '' THEN
    PERFORM public.register_tenant_document(
      NEW.tenant_id, 'tenant_passport', 'house-images', NULL,
      NEW.tenant_photo_url, NEW.id, NEW.agent_id);
  END IF;

  IF NEW.lc_letter_path IS NOT NULL AND btrim(NEW.lc_letter_path) <> '' THEN
    PERFORM public.register_tenant_document(
      NEW.tenant_id, 'lc_letter', COALESCE(NEW.lc_letter_bucket, 'lc-letters'),
      NEW.lc_letter_path, NULL, NEW.id, NEW.agent_id);
  END IF;

  IF NEW.house_image_urls IS NOT NULL THEN
    FOREACH v_url IN ARRAY NEW.house_image_urls LOOP
      IF v_url IS NOT NULL AND btrim(v_url) <> '' THEN
        PERFORM public.register_tenant_document(
          NEW.tenant_id, 'house_image', 'house-images', NULL, v_url, NEW.id, NEW.agent_id);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_rent_request_tenant_documents ON public.rent_requests;
CREATE TRIGGER trg_sync_rent_request_tenant_documents
  AFTER INSERT OR UPDATE OF tenant_photo_url, lc_letter_path, lc_letter_bucket, house_image_urls
  ON public.rent_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_rent_request_tenant_documents();

-- ---------------------------------------------------------------------
-- Reader used by the app
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tenant_documents(p_tenant_id uuid)
RETURNS TABLE (
  id uuid,
  doc_type text,
  bucket text,
  path text,
  public_url text,
  version integer,
  is_current boolean,
  source_rent_request_id uuid,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT td.id, td.doc_type, td.bucket, td.path, td.public_url, td.version,
         td.is_current, td.source_rent_request_id, td.created_at
    FROM public.tenant_documents td
   WHERE td.tenant_id = p_tenant_id
     AND (
       p_tenant_id = auth.uid()
       OR td.uploaded_by = auth.uid()
       OR public.can_manage_tenant_documents(auth.uid())
       OR EXISTS (
         SELECT 1 FROM public.rent_requests rr
         WHERE rr.tenant_id = p_tenant_id AND rr.agent_id = auth.uid()
       )
     )
   ORDER BY td.doc_type, td.is_current DESC, td.version DESC, td.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_documents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_documents(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Backfill from every historic rent request
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_url text;
BEGIN
  FOR r IN
    SELECT id, tenant_id, agent_id, tenant_photo_url, lc_letter_path,
           lc_letter_bucket, house_image_urls, created_at
      FROM public.rent_requests
     WHERE tenant_id IS NOT NULL
     ORDER BY created_at
  LOOP
    IF r.tenant_photo_url IS NOT NULL AND btrim(r.tenant_photo_url) <> '' THEN
      PERFORM public.register_tenant_document(
        r.tenant_id, 'tenant_passport', 'house-images', NULL, r.tenant_photo_url, r.id, r.agent_id);
    END IF;
    IF r.lc_letter_path IS NOT NULL AND btrim(r.lc_letter_path) <> '' THEN
      PERFORM public.register_tenant_document(
        r.tenant_id, 'lc_letter', COALESCE(r.lc_letter_bucket, 'lc-letters'),
        r.lc_letter_path, NULL, r.id, r.agent_id);
    END IF;
    IF r.house_image_urls IS NOT NULL THEN
      FOREACH v_url IN ARRAY r.house_image_urls LOOP
        IF v_url IS NOT NULL AND btrim(v_url) <> '' THEN
          PERFORM public.register_tenant_document(
            r.tenant_id, 'house_image', 'house-images', NULL, v_url, r.id, r.agent_id);
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;