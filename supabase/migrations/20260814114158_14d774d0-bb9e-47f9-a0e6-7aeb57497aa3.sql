DO $$
DECLARE v_agent uuid := '0b109aad-212a-4fd0-ab03-3d7aee9cf397';
        v_desk uuid;
        v_wr uuid;
BEGIN
  SELECT id INTO v_desk FROM public.cashout_agents WHERE agent_id = v_agent AND is_active LIMIT 1;

  -- A. Company float delivery (mirrors approve-deposit auto-credit)
  PERFORM public.create_ledger_transaction(
    jsonb_build_array(
      jsonb_build_object('user_id',v_agent,'ledger_scope','wallet','wallet_bucket','float','direction','cash_in',
        'category','agent_float_deposit','recipient_type','operational_wallet','amount',100000,
        'reference_id','SMOKEFLOAT140826A','description','[SMOKE] Company float delivery to merchant float phone'),
      jsonb_build_object('ledger_scope','platform','direction','cash_out','category','agent_float_deposit',
        'amount',100000,'reference_id','SMOKEFLOAT140826A','description','[SMOKE] Platform sends operational float to merchant')
    ), 'smoke-float-credit-20260814-001', true);

  UPDATE public.deposit_requests SET status='approved', approved_at=now(), updated_at=now()
  WHERE transaction_id='SMOKEFLOAT140826A';

  -- B. Merchant pays out a customer from that float
  INSERT INTO public.withdrawal_requests (user_id, amount, status, payout_method, mobile_money_number,
    mobile_money_provider, assigned_cashout_agent_id, dispatch_claimed_by, dispatch_claimed_at,
    processed_by, processed_at, reason)
  VALUES (v_agent, 30000, 'completed', 'mobile_money', '256701355245', 'mtn', v_desk, v_agent, now(),
    v_agent, now(), '[SMOKE TEST] merchant float payout reconciliation')
  RETURNING id INTO v_wr;

  PERFORM public.create_ledger_transaction(
    jsonb_build_array(
      jsonb_build_object('user_id',v_agent,'ledger_scope','wallet','wallet_bucket','float','direction','cash_out',
        'category','agent_float_settlement','recipient_type','operational_wallet','amount',30000,
        'reference_id',v_wr::text || '-merchant-float-consume','description','[SMOKE] Merchant float consumed for customer payout'),
      jsonb_build_object('ledger_scope','platform','direction','cash_in','category','agent_float_settlement',
        'amount',30000,'reference_id',v_wr::text || '-merchant-float-consume','description','[SMOKE] Float settled against customer payout')
    ), 'smoke-float-consume-' || v_wr::text, true);

  PERFORM public.create_ledger_transaction(
    jsonb_build_array(
      jsonb_build_object('user_id',v_agent,'ledger_scope','wallet','wallet_bucket','float','direction','cash_out',
        'category','agent_float_settlement','recipient_type','operational_wallet','amount',500,
        'reference_id',v_wr::text || '-merchant-telecom-charge','description','[SMOKE] Telecom sending charge'),
      jsonb_build_object('ledger_scope','platform','direction','cash_in','category','agent_float_settlement',
        'amount',500,'reference_id',v_wr::text || '-merchant-telecom-charge','description','[SMOKE] Telecom sending charge recovered')
    ), 'smoke-telecom-' || v_wr::text, true);

  RAISE NOTICE 'withdrawal %', v_wr;
END $$;