DO $$
DECLARE
  rec RECORD;
  v_ref text;
  v_group uuid;
BEGIN
  PERFORM set_config('wallet.legacy_proxy_reversal', 'true', true);

  FOR rec IN
    SELECT a.id AS alloc_id,
           a.withdrawal_request_id AS wr_id,
           a.allocated_amount,
           COALESCE(a.metadata->>'reference', a.metadata->>'email_tid', a.gmail_transaction_id::text) AS bank_reference,
           wr.user_id AS partner_id,
           wr.agent_id AS proxy_agent_id
    FROM bulk_bank_payout_allocations a
    JOIN withdrawal_requests wr ON wr.id = a.withdrawal_request_id
    WHERE a.status = 'settled'
      AND wr.status IN ('pending','requested','manager_approved','cfo_approved','fin_ops_approved','processing')
  LOOP
    -- Unique reference per allocation (dedupe-safe) while preserving bank ref in description
    v_ref := COALESCE(rec.bank_reference, 'SKYBUBBLES') || '-' || left(rec.alloc_id::text, 8);
    v_group := gen_random_uuid();

    PERFORM public.create_ledger_transaction(
      p_transaction_group_id := v_group,
      p_entries := jsonb_build_array(
        jsonb_build_object(
          'user_id', rec.proxy_agent_id,
          'amount', rec.allocated_amount,
          'direction', 'cash_out',
          'category', 'system_balance_correction',
          'ledger_scope', 'wallet',
          'recipient_type', 'user',
          'wallet_bucket', 'withdrawable',
          'classification', 'admin_correction',
          'routing_source', 'skybubbles_bulk_reconcile_v1',
          'source_table', 'bulk_bank_payout_allocations',
          'source_id', rec.alloc_id,
          'reference_id', v_ref,
          'description', 'Reconcile SKYBUBBLES bulk payout WR ' || rec.wr_id::text
                         || ' for partner ' || rec.partner_id::text
                         || ' (bank ref ' || COALESCE(rec.bank_reference, 'n/a') || ')'
        ),
        jsonb_build_object(
          'amount', rec.allocated_amount,
          'direction', 'cash_in',
          'category', 'system_balance_correction',
          'ledger_scope', 'platform',
          'classification', 'admin_correction',
          'source_table', 'bulk_bank_payout_allocations',
          'source_id', rec.alloc_id,
          'reference_id', v_ref,
          'description', 'SKYBUBBLES bulk payout reconciliation (offset)'
        )
      ),
      p_idempotency_key := 'skybubbles-reconcile-' || rec.alloc_id::text,
      p_skip_balance_check := true
    );

    UPDATE public.withdrawal_requests
       SET status = 'completed',
           processed_at = COALESCE(processed_at, now()),
           fin_ops_reference = COALESCE(fin_ops_reference, v_ref),
           transaction_id = COALESCE(transaction_id, v_ref),
           updated_at = now()
     WHERE id = rec.wr_id;

    INSERT INTO public.proxy_payout_settlements
      (approval_id, withdrawal_id, partner_id, agent_id, amount_settled, settled_at, notes)
    VALUES
      (rec.wr_id, rec.wr_id, rec.partner_id, rec.proxy_agent_id, rec.allocated_amount, now(),
       'SKYBUBBLES bulk reconcile (CFO direct debit bypass) — bank ref ' || COALESCE(rec.bank_reference,'n/a'))
    ON CONFLICT (approval_id) DO NOTHING;

    INSERT INTO public.audit_logs (action_type, action, table_name, record_id, metadata)
    VALUES (
      'withdrawal_bulk_force_closed',
      'Force-closed stuck SKYBUBBLES bulk payout via CFO direct debit bypass against proxy agent wallet',
      'withdrawal_requests',
      rec.wr_id::text,
      jsonb_build_object(
        'allocation_id', rec.alloc_id,
        'amount', rec.allocated_amount,
        'proxy_agent_id', rec.proxy_agent_id,
        'partner_id', rec.partner_id,
        'reference', v_ref,
        'bank_reference', rec.bank_reference,
        'transaction_group_id', v_group,
        'reason', 'Cash already left via SKYBUBBLES bank batch; bookkeeping caught up via CFO direct debit bypass'
      )
    );
  END LOOP;
END $$;