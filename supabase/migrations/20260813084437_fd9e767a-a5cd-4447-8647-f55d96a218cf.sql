CREATE OR REPLACE FUNCTION public.get_coo_command_center()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today_start timestamptz := (date_trunc('day', now() AT TIME ZONE 'Africa/Kampala')) AT TIME ZONE 'Africa/Kampala';
  v_yest_start  timestamptz := v_today_start - interval '1 day';
  v_month_start timestamptz := (date_trunc('month', now() AT TIME ZONE 'Africa/Kampala')) AT TIME ZONE 'Africa/Kampala';
  v_out jsonb;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'ceo') OR has_role(auth.uid(), 'coo')
    OR has_role(auth.uid(), 'cfo') OR has_role(auth.uid(), 'operations')
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),
    'today_start', v_today_start,

    /* ---------- Collections (source of truth: agent_collections + eligibility view) ---------- */
    'collections', (
      SELECT jsonb_build_object(
        'today_amount', COALESCE((SELECT SUM(amount) FROM agent_collections WHERE created_at >= v_today_start), 0),
        'today_count', COALESCE((SELECT COUNT(*) FROM agent_collections WHERE created_at >= v_today_start), 0),
        'today_agents', COALESCE((SELECT COUNT(DISTINCT agent_id) FROM agent_collections WHERE created_at >= v_today_start), 0),
        'today_tenants', COALESCE((SELECT COUNT(DISTINCT tenant_id) FROM agent_collections WHERE created_at >= v_today_start), 0),
        'yesterday_amount', COALESCE((SELECT SUM(amount) FROM agent_collections WHERE created_at >= v_yest_start AND created_at < v_today_start), 0),
        'month_amount', COALESCE((SELECT SUM(amount) FROM agent_collections WHERE created_at >= v_month_start), 0),
        'expected_daily', COALESCE((SELECT SUM(expected_daily) FROM v_agent_daily_eligibility), 0),
        'paid_today', COALESCE((SELECT SUM(paid_today) FROM v_agent_daily_eligibility), 0)
      )
    ),

    /* ---------- Agent fleet ---------- */
    'agents', (
      SELECT jsonb_build_object(
        'with_tenants', COALESCE(COUNT(*) FILTER (WHERE active_count > 0), 0),
        'collected_today', COALESCE(COUNT(*) FILTER (WHERE paid_today > 0), 0),
        'idle_today', COALESCE(COUNT(*) FILTER (WHERE active_count > 0 AND COALESCE(paid_today,0) = 0), 0),
        'total_expected_tenants', COALESCE(SUM(active_count), 0)
      )
      FROM v_agent_daily_eligibility
    ),

    /* ---------- Tenant book ---------- */
    'tenants', (
      SELECT jsonb_build_object(
        'active_repaying', COALESCE(COUNT(*), 0),
        'daily_expected', COALESCE(SUM(daily_repayment), 0),
        'outstanding', COALESCE(SUM(GREATEST(total_repayment - amount_repaid, 0)), 0),
        'no_smartphone', COALESCE(COUNT(*) FILTER (WHERE tenant_no_smartphone), 0)
      )
      FROM v_tenant_daily_eligibility
    ),

    /* ---------- Rent pipeline ---------- */
    'pipeline', (
      SELECT jsonb_build_object(
        'service_center_review', jsonb_build_object('n', COUNT(*) FILTER (WHERE status = 'service_center_review'), 'amt', COALESCE(SUM(rent_amount) FILTER (WHERE status = 'service_center_review'), 0)),
        'pending', jsonb_build_object('n', COUNT(*) FILTER (WHERE status = 'pending'), 'amt', COALESCE(SUM(rent_amount) FILTER (WHERE status = 'pending'), 0)),
        'agent_ops_approved', jsonb_build_object('n', COUNT(*) FILTER (WHERE status = 'agent_ops_approved'), 'amt', COALESCE(SUM(rent_amount) FILTER (WHERE status = 'agent_ops_approved'), 0)),
        'awaiting_coo', jsonb_build_object('n', COUNT(*) FILTER (WHERE status = 'landlord_ops_approved'), 'amt', COALESCE(SUM(rent_amount) FILTER (WHERE status = 'landlord_ops_approved'), 0)),
        'awaiting_cfo', jsonb_build_object('n', COUNT(*) FILTER (WHERE status = 'coo_approved'), 'amt', COALESCE(SUM(rent_amount) FILTER (WHERE status = 'coo_approved'), 0)),
        'funded', jsonb_build_object('n', COUNT(*) FILTER (WHERE status = 'funded'), 'amt', COALESCE(SUM(rent_amount) FILTER (WHERE status = 'funded'), 0)),
        'new_today', jsonb_build_object('n', COUNT(*) FILTER (WHERE created_at >= v_today_start), 'amt', COALESCE(SUM(rent_amount) FILTER (WHERE created_at >= v_today_start), 0)),
        'disbursed_today', jsonb_build_object('n', COUNT(*) FILTER (WHERE disbursed_at >= v_today_start), 'amt', COALESCE(SUM(rent_amount) FILTER (WHERE disbursed_at >= v_today_start), 0)),
        'rejected_month', jsonb_build_object('n', COUNT(*) FILTER (WHERE rejected_at >= v_month_start), 'amt', COALESCE(SUM(rent_amount) FILTER (WHERE rejected_at >= v_month_start), 0))
      )
      FROM rent_requests
    ),

    /* ---------- Money awaiting movement ---------- */
    'money', (
      SELECT jsonb_build_object(
        'withdrawals_pending', jsonb_build_object(
          'n', COALESCE((SELECT COUNT(*) FROM withdrawal_requests WHERE status = 'pending'), 0),
          'amt', COALESCE((SELECT SUM(amount) FROM withdrawal_requests WHERE status = 'pending'), 0)),
        'withdrawals_processing', jsonb_build_object(
          'n', COALESCE((SELECT COUNT(*) FROM withdrawal_requests WHERE status IN ('processing','approved')), 0),
          'amt', COALESCE((SELECT SUM(amount) FROM withdrawal_requests WHERE status IN ('processing','approved')), 0)),
        'withdrawals_paid_today', jsonb_build_object(
          'n', COALESCE((SELECT COUNT(*) FROM withdrawal_requests WHERE status = 'completed' AND processed_at >= v_today_start), 0),
          'amt', COALESCE((SELECT SUM(amount) FROM withdrawal_requests WHERE status = 'completed' AND processed_at >= v_today_start), 0)),
        'landlord_payouts_open', jsonb_build_object(
          'n', COALESCE((SELECT COUNT(*) FROM landlord_payouts WHERE status IN ('pending_merchant_payout','awaiting_agent_receipt','otp_verified')), 0),
          'amt', COALESCE((SELECT SUM(amount) FROM landlord_payouts WHERE status IN ('pending_merchant_payout','awaiting_agent_receipt','otp_verified')), 0)),
        'landlord_payouts_failed', jsonb_build_object(
          'n', COALESCE((SELECT COUNT(*) FROM landlord_payouts WHERE status = 'failed'), 0),
          'amt', COALESCE((SELECT SUM(amount) FROM landlord_payouts WHERE status = 'failed'), 0)),
        'agent_float_outstanding', COALESCE((SELECT SUM(balance) FROM agent_landlord_float), 0),
        'wallet_float', COALESCE((SELECT SUM(float_balance) FROM wallets), 0),
        'wallet_withdrawable', COALESCE((SELECT SUM(withdrawable_balance) FROM wallets), 0)
      )
    ),

    /* ---------- Decisions waiting on the COO ---------- */
    'decisions', (
      SELECT jsonb_build_object(
        'rent_approvals', COALESCE((SELECT COUNT(*) FROM rent_requests WHERE status = 'landlord_ops_approved'), 0),
        'withdrawal_approvals', COALESCE((SELECT COUNT(*) FROM withdrawal_requests WHERE status = 'pending'), 0),
        'business_advances', COALESCE((SELECT COUNT(*) FROM business_advances WHERE status = 'landlord_ops_approved'), 0),
        'requisitions', COALESCE((SELECT COUNT(*) FROM director_requisitions WHERE status = 'pending'), 0),
        'partner_portfolios', COALESCE((SELECT COUNT(*) FROM funder_pending_portfolios WHERE status = 'pending'), 0)
      )
    ),

    /* ---------- Partner capital ---------- */
    'partners', (
      SELECT jsonb_build_object(
        'active_portfolios', COALESCE(COUNT(*) FILTER (WHERE status = 'active'), 0),
        'active_capital', COALESCE(SUM(amount) FILTER (WHERE status = 'active'), 0),
        'partners', COALESCE(COUNT(DISTINCT investor_id) FILTER (WHERE status = 'active'), 0)
      )
      FROM investor_portfolios
    )
  ) INTO v_out;

  RETURN v_out;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_coo_command_center() FROM public;
GRANT EXECUTE ON FUNCTION public.get_coo_command_center() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coo_command_center() TO service_role;