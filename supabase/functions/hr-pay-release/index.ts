import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkTreasuryGuard } from "../_shared/treasuryGuard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const json = (payload: unknown, status: number) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  // 1. CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // 2. Treasury guard — this function moves money
    const guardBlock = await checkTreasuryGuard(adminClient, "any", req.headers.get("Authorization"));
    if (guardBlock) return guardBlock;

    // 3. Resolve the caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    // 4. Authorise by POSITION via rpc, running as the caller (never user_roles)
    const { data: isReleaser } = await (userClient.rpc as any)('hr_pay_is_releaser');
    let authorised = isReleaser === true;
    if (!authorised) {
      const { data: isRuleAdmin } = await (userClient.rpc as any)('hr_pay_is_rule_admin');
      authorised = isRuleAdmin === true;
    }
    if (!authorised) {
      return json({ error: 'Only the position holding release authority may release a payroll run.' }, 403);
    }

    const body = await req.json();
    const runId: string = body?.runId;
    const dryRun: boolean = body?.dryRun === true;
    if (!runId) return json({ error: 'runId is required' }, 400);

    // 5. Load the run
    const { data: run, error: runErr } = await adminClient
      .from('hr_pay_runs')
      .select('id, status, period_id, hr_pay_periods:period_id(code)')
      .eq('id', runId)
      .maybeSingle();
    if (runErr || !run) return json({ error: 'Payroll run not found' }, 404);
    if (run.status !== 'approved') {
      return json({ error: `Payroll run status is '${run.status}' — only an approved run can be released.` }, 409);
    }
    const periodCode: string = (run as any).hr_pay_periods?.code ?? '';

    // 6. Current payslips joined to staff
    const { data: payslips, error: psErr } = await adminClient
      .from('hr_pay_payslips')
      .select('id, staff_id, net, hr_staff:staff_id(id, staff_ref, user_id)')
      .eq('run_id', runId)
      .eq('is_current', true);
    if (psErr) return json({ error: psErr.message }, 500);
    const rows = payslips ?? [];

    // 7. Dry run — write nothing
    if (dryRun) {
      const items = rows.map((p: any) => {
        const net = Number(p.net ?? 0);
        let blocker: string | null = null;
        if (net <= 0) blocker = 'Net is zero or negative';
        else if (!p.hr_staff?.user_id) blocker = 'Staff member has no linked user account';
        return { staff_ref: p.hr_staff?.staff_ref ?? null, amount: net, blocker };
      });
      return json({
        dryRun: true,
        payslip_count: rows.length,
        total_net: items.reduce((s, i) => s + i.amount, 0),
        items,
      }, 200);
    }

    // 8. Post each payslip sequentially
    let posted = 0, skipped = 0, failed = 0, alreadyHandled = 0, totalPosted = 0;

    for (const p of rows as any[]) {
      const net = Number(p.net ?? 0);
      const employeeUserId: string | null = p.hr_staff?.user_id ?? null;

      // a. deterministic idempotency key
      const idempotencyKey = "hrpay:" + runId + ":" + p.id;

      // b. claim the attempt
      const { data: disb, error: insErr } = await adminClient
        .from('hr_pay_disbursements')
        .insert({
          run_id: runId,
          payslip_id: p.id,
          staff_id: p.staff_id,
          user_id: employeeUserId,
          amount: net,
          idempotency_key: idempotencyKey,
          status: 'pending',
          attempted_at: new Date().toISOString(),
          released_by: user.id,
        })
        .select('id')
        .single();

      if (insErr) {
        if ((insErr as any).code === '23505' || /duplicate key|unique/i.test(insErr.message)) {
          alreadyHandled++;
          continue;
        }
        failed++;
        console.error(`[hr-pay-release] claim failed for payslip ${p.id}:`, insErr.message);
        continue;
      }
      const disbId = disb!.id;

      // c. zero or negative net
      if (net <= 0) {
        await adminClient.from('hr_pay_disbursements')
          .update({ status: 'skipped', error_text: 'Net is zero or negative' })
          .eq('id', disbId);
        skipped++;
        continue;
      }

      // d. no linked user account
      if (!employeeUserId) {
        await adminClient.from('hr_pay_disbursements')
          .update({ status: 'failed', error_text: 'Staff member has no linked user account — cannot credit a wallet' })
          .eq('id', disbId);
        failed++;
        continue;
      }

      // e. ensure wallet exists
      await adminClient.from('wallets')
        .upsert({ user_id: employeeUserId, balance: 0 }, { onConflict: 'user_id', ignoreDuplicates: true });

      // f. reference + timestamp
      const refId = crypto.randomUUID();
      const payTxDate = new Date().toISOString();

      // g. two balanced legs; recipient_type routes the credit to withdrawable
      const entries = [
        {
          user_id: employeeUserId, ledger_scope: 'platform', direction: 'cash_out',
          amount: net, category: 'system_balance_correction',
          source_table: 'hr_pay_payslips',
          description: 'Salary take-home',
          currency: 'UGX', reference_id: refId, transaction_date: payTxDate,
          recipient_type: 'user',
        },
        {
          user_id: employeeUserId, ledger_scope: 'wallet', direction: 'cash_in',
          amount: net, category: 'system_balance_correction',
          source_table: 'hr_pay_payslips',
          description: 'Salary for ' + periodCode,
          currency: 'UGX', reference_id: refId, transaction_date: payTxDate,
          recipient_type: 'user',
        },
      ];

      // h. post
      const { error: rpcErr } = await adminClient.rpc('create_ledger_transaction', { entries });

      // i. failure — record and carry on
      if (rpcErr) {
        console.error(`[hr-pay-release] ledger error for payslip ${p.id}:`, rpcErr.message);
        await adminClient.from('hr_pay_disbursements')
          .update({ status: 'failed', error_text: rpcErr.message })
          .eq('id', disbId);
        failed++;
        continue;
      }

      // j. success
      await adminClient.from('hr_pay_disbursements')
        .update({ status: 'posted', ledger_reference_id: refId, posted_at: new Date().toISOString() })
        .eq('id', disbId);

      await adminClient.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'hr_pay_disbursed',
        table_name: 'hr_pay_disbursements',
        record_id: disbId,
        metadata: {
          run_id: runId,
          payslip_id: p.id,
          staff_id: p.staff_id,
          amount: net,
          reference_id: refId,
        },
      });

      posted++;
      totalPosted += net;
    }

    // 9. Summary
    return json({
      success: true,
      posted,
      skipped,
      failed,
      already_handled: alreadyHandled,
      total_posted: totalPosted,
    }, 200);
  } catch (e) {
    console.error('[hr-pay-release] unhandled error:', (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});