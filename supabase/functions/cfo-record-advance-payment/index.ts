import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Missing auth' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await adminClient.auth.getUser(token);
    if (userErr || !userData.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const recordedBy = userData.user.id;

    const body = await req.json();
    const { advance_id, amount, payment_method, reference, notes } = body;
    if (!advance_id || !amount || amount <= 0) {
      return new Response(JSON.stringify({ error: 'advance_id and positive amount required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch fresh advance
    const { data: advance, error: advErr } = await adminClient
      .from('agent_advances')
      .select('*')
      .eq('id', advance_id)
      .single();
    if (advErr || !advance) throw new Error('Advance not found');
    if (advance.status === 'completed') throw new Error('Advance already completed');

    const today = new Date().toISOString().split('T')[0];
    const openingBalance = Number(advance.outstanding_balance);
    const amountPaid = Math.min(Number(amount), openingBalance);
    const closingBalance = Math.max(0, openingBalance - amountPaid);

    // Insert ledger row tagged as manual CFO entry
    await adminClient.from('agent_advance_ledger').insert({
      advance_id: advance.id,
      date: today,
      opening_balance: openingBalance,
      interest_accrued: 0,
      amount_deducted: amountPaid,
      closing_balance: closingBalance,
      deduction_status: closingBalance <= 0 ? 'full' : 'partial',
    });

    // Recompute fee collection state
    const isOverdue = new Date() > new Date(advance.expires_at);
    const newStatus = closingBalance <= 0 ? 'completed' : (isOverdue ? 'overdue' : 'active');
    const advAccessFee = Number(advance.access_fee || 0);
    const totalPayable = Number(advance.principal) + advAccessFee;
    const totalDeducted = totalPayable - closingBalance;
    const feeCollectionRatio = totalPayable > 0 ? Math.min(1, totalDeducted / totalPayable) : 0;
    const newFeeCollected = Math.round(advAccessFee * feeCollectionRatio);
    const feeStatus = newFeeCollected >= advAccessFee ? 'settled' : newFeeCollected > 0 ? 'partial' : 'unpaid';

    await adminClient.from('agent_advances').update({
      outstanding_balance: closingBalance,
      status: newStatus,
      access_fee_collected: newFeeCollected,
      access_fee_status: feeStatus,
    }).eq('id', advance.id);

    // Record balanced ledger transaction (cash_in to platform from agent's external repayment)
    const description = `CFO-recorded advance payment${reference ? ` · ref ${reference}` : ''}${payment_method ? ` · ${payment_method}` : ''}${notes ? ` · ${notes}` : ''}`;
    const { error: rpcErr } = await adminClient.rpc('create_ledger_transaction', {
      entries: [
        {
          user_id: advance.agent_id,
          ledger_scope: 'wallet',
          direction: 'cash_out',
          amount: amountPaid,
          category: 'agent_repayment',
          source_table: 'agent_advances',
          source_id: advance.id,
          description,
          currency: 'UGX',
          transaction_date: today,
        },
        {
          user_id: advance.agent_id,
          ledger_scope: 'platform',
          direction: 'cash_in',
          amount: amountPaid,
          category: 'agent_repayment',
          source_table: 'agent_advances',
          source_id: advance.id,
          description,
          currency: 'UGX',
          transaction_date: today,
        },
      ],
    });
    if (rpcErr) console.error('[cfo-record-advance-payment] RPC error:', rpcErr);

    await adminClient.from('audit_logs').insert({
      user_id: recordedBy,
      action_type: 'cfo_advance_payment_recorded',
      table_name: 'agent_advances',
      record_id: advance.id,
      reason: (notes || `manual payment ${reference || ''}`).slice(0, 200).padEnd(10, '.'),
      metadata: {
        amount: amountPaid,
        payment_method,
        reference,
        opening_balance: openingBalance,
        closing_balance: closingBalance,
        new_status: newStatus,
      },
    });

    return new Response(JSON.stringify({
      success: true,
      amount_recorded: amountPaid,
      closing_balance: closingBalance,
      new_status: newStatus,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('[cfo-record-advance-payment] error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});