DO $$
DECLARE v_group uuid;
BEGIN
  v_group := public.create_ledger_transaction(
    jsonb_build_array(
      jsonb_build_object(
        'user_id','0b109aad-212a-4fd0-ab03-3d7aee9cf397',
        'ledger_scope','wallet',
        'wallet_bucket','float',
        'direction','cash_out',
        'category','system_balance_correction',
        'recipient_type','operational_wallet',
        'classification','admin_correction',
        'solvency_bypass_reason','admin_correction_seed',
        'amount',245000,
        'description','CFO Debit [Wallet Retraction]: Zero operational float for merchant smoke test'
      ),
      jsonb_build_object(
        'ledger_scope','platform',
        'direction','cash_in',
        'category','system_balance_correction',
        'classification','admin_correction',
        'amount',245000,
        'description','TESTING DONT WITHDRAW to Platform [neutral]: Zero operational float for merchant smoke test'
      )
    ),
    'smoke-test-zero-float-0b109aad-2026-08-14',
    true
  );
  RAISE NOTICE 'group %', v_group;
END $$;