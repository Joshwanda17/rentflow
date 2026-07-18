import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { attemptYoolaPrimary } from '../_shared/yoolaPrimary.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const fmtUGX = (n: number) => `UGX ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

/**
 * Voluntary advance repayment. Agent pays ahead: money is deducted from
 * withdrawable NOW; the future daily deductions matching the days covered
 * are skipped (via `prepaid_installments_remaining` on agent_advances).
 *
 * Body: { advance_id: string, amount?: number, days_ahead?: number }
 * One of `amount` or `days_ahead` must be provided.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: corsHeaders });
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: corsHeaders });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const advanceId = body?.advance_id;
    if (!advanceId) return new Response(JSON.stringify({ error: 'advance_id required' }), { status: 400, headers: corsHeaders });

    const { data: advance, error: advErr } = await admin.from('agent_advances')
      .select('*').eq('id', advanceId).maybeSingle();
    if (advErr || !advance) return new Response(JSON.stringify({ error: 'Advance not found' }), { status: 404, headers: corsHeaders });
    if (advance.agent_id !== userId) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
    if (!['active', 'overdue'].includes(advance.status)) {
      return new Response(JSON.stringify({ error: 'Advance is not active' }), { status: 400, headers: corsHeaders });
    }

    const cycleDays = Number(advance.cycle_days) || 30;
    const totalPayable = Number(advance.principal) + Number(advance.access_fee || 0);
    const scheduledDaily = cycleDays > 0 ? Math.round(totalPayable / cycleDays) : 0;
    if (scheduledDaily <= 0) {
      return new Response(JSON.stringify({ error: 'Cannot compute scheduled daily' }), { status: 400, headers: corsHeaders });
    }

    let daysAhead = Number(body?.days_ahead || 0);
    let amount = Number(body?.amount || 0);
    if (!amount && !daysAhead) {
      return new Response(JSON.stringify({ error: 'amount or days_ahead required' }), { status: 400, headers: corsHeaders });
    }
    if (daysAhead && !amount) amount = scheduledDaily * daysAhead;
    if (!daysAhead && amount) daysAhead = Math.floor(amount / scheduledDaily);
    amount = Math.max(0, Math.round(amount));
    if (amount <= 0) return new Response(JSON.stringify({ error: 'Invalid amount' }), { status: 400, headers: corsHeaders });

    // Cap amount at what's owed (interest included is handled by the daily cron; here treat outstanding as ceiling).
    const outstanding = Number(advance.outstanding_balance);
    if (amount > outstanding) amount = outstanding;

    // Verify withdrawable balance (STRICT).
    const { data: availRaw, error: availErr } = await admin.rpc('get_user_available_balance', { p_user_id: userId });
    if (availErr) return new Response(JSON.stringify({ error: availErr.message }), { status: 500, headers: corsHeaders });
    const withdrawable = Math.max(0, Number(availRaw ?? 0));
    if (withdrawable < amount) {
      return new Response(JSON.stringify({ error: `Insufficient withdrawable balance. Available ${fmtUGX(withdrawable)}, needed ${fmtUGX(amount)}.` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const today = new Date().toISOString().split('T')[0];
    const idem = `voluntary_prepay_${advance.id}_${Date.now()}`;
    const meta = {
      source: 'voluntary_prepayment',
      advance_id: advance.id,
      bucket_intent: 'advance_balance_recovery',
      days_ahead: daysAhead,
    };

    const { error: rpcErr } = await admin.rpc('create_ledger_transaction', {
      entries: [
        {
          user_id: userId, ledger_scope: 'wallet', direction: 'cash_out', amount,
          category: 'agent_repayment', recipient_type: 'user',
          source_table: 'agent_advances', source_id: advance.id,
          description: `Voluntary advance repayment (${daysAhead} day${daysAhead === 1 ? '' : 's'} ahead)`,
          currency: 'UGX', transaction_date: today, metadata: meta,
        },
        {
          user_id: userId, ledger_scope: 'platform', direction: 'cash_in', amount,
          category: 'agent_repayment', recipient_type: 'operational_wallet',
          source_table: 'agent_advances', source_id: advance.id,
          description: 'Voluntary advance repayment received',
          currency: 'UGX', transaction_date: today, metadata: meta,
        },
      ],
      idempotency_key: idem,
    });
    if (rpcErr) return new Response(JSON.stringify({ error: rpcErr.message }), { status: 500, headers: corsHeaders });

    // Update advance: outstanding, arrears, status, prepaid counter, access fee.
    const closing = Math.max(0, outstanding - amount);
    const currentArrears = Number(advance.arrears_balance || 0);
    const newArrears = Math.max(0, Math.min(currentArrears - amount, closing));
    const newStatus = closing <= 0 ? 'completed' : advance.status;
    const totalDeducted = totalPayable - closing;
    const feeRatio = totalPayable > 0 ? Math.min(1, totalDeducted / totalPayable) : 0;
    const newFeeCollected = Math.round(Number(advance.access_fee || 0) * feeRatio);
    const feeStatus = newFeeCollected >= Number(advance.access_fee || 0) ? 'settled' : newFeeCollected > 0 ? 'partial' : 'unpaid';

    // Only add prepaid installments for days that AREN'T today (today already has ledger row we'll write below).
    const prepaidToAdd = closing > 0 ? Math.max(0, daysAhead) : 0;

    await admin.from('agent_advances').update({
      outstanding_balance: closing,
      status: newStatus,
      access_fee_collected: newFeeCollected,
      access_fee_status: feeStatus,
      arrears_balance: newArrears,
      prepaid_installments_remaining: Number(advance.prepaid_installments_remaining || 0) + prepaidToAdd,
    }).eq('id', advance.id);

    // Ledger daybook row for today (voluntary payment).
    await admin.from('agent_advance_ledger').insert({
      advance_id: advance.id,
      date: today,
      opening_balance: outstanding,
      interest_accrued: 0,
      amount_deducted: amount,
      closing_balance: closing,
      deduction_status: 'voluntary_payment',
    });

    // SMS agent.
    const { data: prof } = await admin.from('profiles').select('phone, full_name').eq('id', userId).maybeSingle();
    if (prof?.phone) {
      const msg = `WELILE: You voluntarily paid ${fmtUGX(amount)} toward your advance today. ${daysAhead > 0 ? `Next ${daysAhead} scheduled daily deduction${daysAhead === 1 ? '' : 's'} will be skipped. ` : ''}Outstanding ${fmtUGX(closing)}.`;
      try {
        await attemptYoolaPrimary(prof.phone, msg, {
          source: 'advance_voluntary_repayment',
          recipientUserId: userId,
          recipientName: prof.full_name ?? undefined,
        });
      } catch (_e) { /* SMS failure is non-blocking */ }
    }

    return new Response(JSON.stringify({
      ok: true, amount_paid: amount, days_ahead: daysAhead,
      outstanding: closing, prepaid_installments_remaining: Number(advance.prepaid_installments_remaining || 0) + prepaidToAdd,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});