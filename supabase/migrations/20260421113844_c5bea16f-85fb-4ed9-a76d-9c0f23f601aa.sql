
DO $$
DECLARE
  v_agent uuid := '04ef6aad-ade8-4dbc-ae3f-09669a836952';
  v_old_withdrawable numeric;
  v_old_balance numeric;
  v_new numeric := 50000;
BEGIN
  PERFORM set_config('wallet.sync_authorized', 'true', true);

  SELECT withdrawable_balance, balance INTO v_old_withdrawable, v_old_balance
  FROM public.wallets WHERE user_id = v_agent;

  UPDATE public.wallets
     SET withdrawable_balance = v_new,
         balance = v_new,
         updated_at = now()
   WHERE user_id = v_agent;

  INSERT INTO public.audit_logs (user_id, action_type, action, table_name, record_id, metadata)
  VALUES (
    v_agent,
    'wallet_bucket_reconcile',
    'wallet_bucket_reconcile',
    'wallets',
    v_agent::text,
    jsonb_build_object(
      'reason', 'cached withdrawable_balance drifted from ledger; ledger truth = 50,000 (commission only)',
      'old_withdrawable_balance', v_old_withdrawable,
      'old_balance', v_old_balance,
      'new_withdrawable_balance', v_new,
      'new_balance', v_new,
      'reconciled_at', now()
    )
  );
END $$;
