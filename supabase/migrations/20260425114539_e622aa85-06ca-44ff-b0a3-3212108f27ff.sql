-- Adds the audit linkage from a field collection to the validated agent_collections record it produced.
-- Required so confirmed field collections are auditable and not double-confirmed.
ALTER TABLE public.field_collections
  ADD COLUMN IF NOT EXISTS confirmed_by UUID;

-- FK from confirmed_collection_id (already exists on the table) to agent_collections.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'field_collections_confirmed_collection_id_fkey'
  ) THEN
    ALTER TABLE public.field_collections
      ADD CONSTRAINT field_collections_confirmed_collection_id_fkey
      FOREIGN KEY (confirmed_collection_id)
      REFERENCES public.agent_collections(id)
      ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_field_collections_confirmed_collection_id
  ON public.field_collections(confirmed_collection_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: confirm_field_collection
--   Promotes a 'pending' field_collections row into a validated agent_collections
--   record with full audit trail. The agent who captured the entry must be the caller.
--   Optionally allows the agent to override the matched tenant (e.g. walk-up cases).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_field_collection(
  p_field_collection_id UUID,
  p_tenant_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_fc RECORD;
  v_tenant_id UUID;
  v_collection_id UUID;
  v_float_before NUMERIC := 0;
  v_float_after NUMERIC := 0;
  v_collected_today NUMERIC := 0;
  v_float_limit NUMERIC := 0;
  v_cash_on_hand NUMERIC := 0;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Lock the row so two clicks can't double-confirm
  SELECT * INTO v_fc
  FROM public.field_collections
  WHERE id = p_field_collection_id
  FOR UPDATE;

  IF v_fc IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Field collection not found');
  END IF;

  IF v_fc.agent_id <> v_caller THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your field collection');
  END IF;

  IF v_fc.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Field collection is not pending (status=' || v_fc.status || ')');
  END IF;

  v_tenant_id := COALESCE(p_tenant_id, v_fc.tenant_id);

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tenant must be matched before confirming');
  END IF;

  -- Verify the matched tenant exists
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_tenant_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Matched tenant profile not found');
  END IF;

  -- Read agent float snapshot (if present) — used for audit on the agent_collections row
  SELECT COALESCE(cash_on_hand, 0), COALESCE(collected_today, 0), COALESCE(float_limit, 0)
    INTO v_cash_on_hand, v_collected_today, v_float_limit
  FROM public.agent_float_limits
  WHERE agent_id = v_caller;

  v_float_before := v_cash_on_hand;
  v_float_after := v_cash_on_hand + v_fc.amount;

  -- Insert the validated agent_collections record (cash, captured offline)
  INSERT INTO public.agent_collections (
    agent_id,
    tenant_id,
    amount,
    payment_method,
    notes,
    location_name,
    float_before,
    float_after,
    created_at
  ) VALUES (
    v_caller,
    v_tenant_id,
    v_fc.amount,
    'cash'::collection_payment_method,
    COALESCE(p_notes, v_fc.notes),
    v_fc.location_name,
    v_float_before,
    v_float_after,
    v_fc.captured_at  -- preserve the original capture timestamp for audit
  )
  RETURNING id INTO v_collection_id;

  -- Update agent's running cash-on-hand + collected-today counters when row exists
  UPDATE public.agent_float_limits
  SET cash_on_hand = COALESCE(cash_on_hand, 0) + v_fc.amount,
      collected_today = COALESCE(collected_today, 0) + v_fc.amount,
      updated_at = now()
  WHERE agent_id = v_caller;

  -- Mark the field collection confirmed and link to the audited record
  UPDATE public.field_collections
  SET status = 'confirmed',
      confirmed_at = now(),
      confirmed_by = v_caller,
      confirmed_collection_id = v_collection_id,
      tenant_id = v_tenant_id,
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_field_collection_id;

  RETURN jsonb_build_object(
    'success', true,
    'collection_id', v_collection_id,
    'tenant_id', v_tenant_id,
    'amount', v_fc.amount,
    'captured_at', v_fc.captured_at,
    'confirmed_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_field_collection(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_field_collection(UUID, UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: reject_field_collection
--   Lets the capturing agent void a pending entry (e.g. wrong tenant, duplicate).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_field_collection(
  p_field_collection_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_fc RECORD;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required');
  END IF;

  SELECT * INTO v_fc
  FROM public.field_collections
  WHERE id = p_field_collection_id
  FOR UPDATE;

  IF v_fc IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Field collection not found');
  END IF;
  IF v_fc.agent_id <> v_caller THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your field collection');
  END IF;
  IF v_fc.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already finalized');
  END IF;

  UPDATE public.field_collections
  SET status = 'rejected',
      rejected_reason = p_reason,
      updated_at = now()
  WHERE id = p_field_collection_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.reject_field_collection(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_field_collection(UUID, TEXT) TO authenticated;