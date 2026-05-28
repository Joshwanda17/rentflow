CREATE TABLE IF NOT EXISTS public.bulk_payout_stuck_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_request_id uuid NOT NULL,
  allocation_id uuid NOT NULL,
  partner_id uuid,
  proxy_agent_id uuid,
  amount numeric NOT NULL,
  bank_reference text,
  wr_status text NOT NULL,
  severity text NOT NULL DEFAULT 'high',
  status text NOT NULL DEFAULT 'open',
  missing_ledger_entries jsonb NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bulk_payout_stuck_alerts_open
  ON public.bulk_payout_stuck_alerts (withdrawal_request_id, allocation_id)
  WHERE status <> 'resolved';

CREATE INDEX IF NOT EXISTS idx_bulk_payout_stuck_alerts_status
  ON public.bulk_payout_stuck_alerts (status, detected_at DESC);

GRANT SELECT, UPDATE ON public.bulk_payout_stuck_alerts TO authenticated;
GRANT ALL ON public.bulk_payout_stuck_alerts TO service_role;

ALTER TABLE public.bulk_payout_stuck_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ops/CFO/CTO can read bulk payout stuck alerts"
  ON public.bulk_payout_stuck_alerts FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'cfo'::app_role)
    OR public.has_role(auth.uid(), 'operations'::app_role)
    OR public.has_role(auth.uid(), 'coo'::app_role)
    OR public.has_role(auth.uid(), 'cto'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Ops/CFO/CTO can update bulk payout stuck alerts"
  ON public.bulk_payout_stuck_alerts FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'cfo'::app_role)
    OR public.has_role(auth.uid(), 'operations'::app_role)
    OR public.has_role(auth.uid(), 'coo'::app_role)
    OR public.has_role(auth.uid(), 'cto'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE TRIGGER trg_bulk_payout_stuck_alerts_updated_at
  BEFORE UPDATE ON public.bulk_payout_stuck_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.detect_bulk_payout_stuck_alerts()
RETURNS TABLE (inserted_count int, total_open int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
  v_open int := 0;
  rec RECORD;
  v_has_wallet_debit boolean;
  v_has_platform_offset boolean;
  v_missing jsonb;
  v_bank_ref text;
BEGIN
  FOR rec IN
    SELECT a.id AS alloc_id,
           a.withdrawal_request_id AS wr_id,
           a.allocated_amount,
           a.gmail_transaction_id,
           a.metadata,
           wr.user_id AS partner_id,
           wr.agent_id AS proxy_agent_id,
           wr.status AS wr_status
    FROM public.bulk_bank_payout_allocations a
    JOIN public.withdrawal_requests wr ON wr.id = a.withdrawal_request_id
    WHERE a.status = 'settled'
      AND wr.status IN ('pending','requested','manager_approved','cfo_approved',
                        'fin_ops_approved','processing')
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.general_ledger gl
       WHERE gl.source_table = 'bulk_bank_payout_allocations'
         AND gl.source_id = rec.alloc_id
         AND gl.direction = 'cash_out'
         AND gl.ledger_scope = 'wallet'
    ) INTO v_has_wallet_debit;

    SELECT EXISTS (
      SELECT 1 FROM public.general_ledger gl
       WHERE gl.source_table = 'bulk_bank_payout_allocations'
         AND gl.source_id = rec.alloc_id
         AND gl.direction = 'cash_in'
         AND gl.ledger_scope = 'platform'
    ) INTO v_has_platform_offset;

    IF v_has_wallet_debit AND v_has_platform_offset THEN
      CONTINUE;
    END IF;

    v_bank_ref := COALESCE(rec.metadata->>'reference',
                           rec.metadata->>'email_tid',
                           rec.gmail_transaction_id::text);

    v_missing := jsonb_build_object(
      'expected', jsonb_build_array(
        jsonb_build_object(
          'leg', 'wallet_debit',
          'user_id', rec.proxy_agent_id,
          'direction', 'cash_out',
          'ledger_scope', 'wallet',
          'wallet_bucket', 'withdrawable',
          'recipient_type', 'user',
          'category_suggestion', 'system_balance_correction',
          'classification', 'admin_correction',
          'amount', rec.allocated_amount,
          'source_table', 'bulk_bank_payout_allocations',
          'source_id', rec.alloc_id,
          'present', v_has_wallet_debit
        ),
        jsonb_build_object(
          'leg', 'platform_offset',
          'direction', 'cash_in',
          'ledger_scope', 'platform',
          'category_suggestion', 'system_balance_correction',
          'classification', 'admin_correction',
          'amount', rec.allocated_amount,
          'source_table', 'bulk_bank_payout_allocations',
          'source_id', rec.alloc_id,
          'present', v_has_platform_offset
        )
      ),
      'remediation_hint',
        'Cash already left via the bulk bank batch. Post the missing leg(s) via '
        || 'create_ledger_transaction (classification=admin_correction), force-close '
        || 'the withdrawal request to completed, and insert a proxy_payout_settlements '
        || 'row so the proxy agent UI clears the in-flight card.'
    );

    INSERT INTO public.bulk_payout_stuck_alerts (
      withdrawal_request_id, allocation_id, partner_id, proxy_agent_id,
      amount, bank_reference, wr_status, severity, status, missing_ledger_entries
    )
    VALUES (
      rec.wr_id, rec.alloc_id, rec.partner_id, rec.proxy_agent_id,
      rec.allocated_amount, v_bank_ref, rec.wr_status,
      CASE WHEN rec.allocated_amount >= 10000000 THEN 'critical' ELSE 'high' END,
      'open',
      v_missing
    )
    ON CONFLICT (withdrawal_request_id, allocation_id)
      WHERE status <> 'resolved'
    DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_open
  FROM public.bulk_payout_stuck_alerts WHERE status <> 'resolved';

  RETURN QUERY SELECT v_inserted, v_open;
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_bulk_payout_stuck_alerts() TO service_role;
GRANT EXECUTE ON FUNCTION public.detect_bulk_payout_stuck_alerts() TO authenticated;