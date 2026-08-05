DO $$
DECLARE
  v_partner uuid := 'b4d7c324-1f7e-4e1c-91a8-3f0e10e0b25c';
  v_commitment uuid := '212e6a09-68bf-44ad-ba47-f4e8a9619993';
  v_amount numeric := 800000;
  v_group uuid := gen_random_uuid();
  v_entries jsonb;
BEGIN
  v_entries := jsonb_build_array(
    jsonb_build_object(
      'user_id', v_partner, 'amount', v_amount, 'direction', 'cash_in',
      'category', 'supporter_rent_fund', 'ledger_scope', 'wallet',
      'recipient_type', 'user', 'wallet_bucket', 'withdrawable',
      'description', 'Reversal of test self-managed partner funding (commitment cancelled)',
      'reference_id', v_commitment::text
    ),
    jsonb_build_object(
      'amount', v_amount, 'direction', 'cash_out',
      'category', 'partner_funding', 'ledger_scope', 'platform',
      'description', 'Reversal of test self-managed partner capital (commitment cancelled)',
      'reference_id', v_commitment::text
    )
  );

  PERFORM public.create_ledger_transaction(
    v_group,
    v_entries,
    'psm-test-reversal-' || v_commitment::text,
    true
  );

  UPDATE public.rent_requests
     SET self_funding_partner_id = NULL,
         self_funding_line_id = NULL
   WHERE self_funding_line_id IN (
     SELECT id FROM public.partner_self_funding_lines WHERE commitment_id = v_commitment
   );

  UPDATE public.partner_self_funding_lines
     SET status = 'cancelled', completed_at = now()
   WHERE commitment_id = v_commitment;

  UPDATE public.partner_self_commitments
     SET status = 'cancelled', next_payout_at = NULL
   WHERE id = v_commitment;

  UPDATE public.partner_self_plan_claims c
     SET status = 'released', updated_at = now()
   WHERE c.commitment_id IN (
     SELECT id FROM public.partner_self_commitments WHERE status = 'cancelled'
   );

  INSERT INTO public.audit_logs (action_type, table_name, record_id, action, user_id, metadata)
  VALUES (
    'psm_test_reversal',
    'partner_self_commitments',
    v_commitment,
    'Reverting test self-managed support; tenants returned to funding queue and UGX 800,000 principal restored to partner withdrawable wallet',
    v_partner,
    jsonb_build_object('reversal_group_id', v_group, 'amount', v_amount)
  );
END $$;