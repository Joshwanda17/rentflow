import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Monthly rate 33%, daily equivalent: (1.33^(1/30) - 1)
const DAILY_INTEREST_RATE = Math.pow(1.33, 1 / 30) - 1;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: advances, error: fetchError } = await supabase
      .from('agent_advances')
      .select('*')
      .in('status', ['active', 'overdue']);

    if (fetchError) throw fetchError;
    if (!advances || advances.length === 0) {
      return new Response(JSON.stringify({ message: 'No active advances to process' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];
    const skipped = [];
    const today = new Date().toISOString().split('T')[0];

    for (const advance of advances) {
      // Idempotency: skip if already processed today
      const { data: existingEntry } = await supabase
        .from('agent_advance_ledger')
        .select('id')
        .eq('advance_id', advance.id)
        .eq('date', today)
        .maybeSingle();

      if (existingEntry) {
        skipped.push(advance.id);
        continue;
      }

      const openingBalance = Number(advance.outstanding_balance);
      const interestAccrued = Math.round(openingBalance * DAILY_INTEREST_RATE);
      const balanceAfterInterest = openingBalance + interestAccrued;

      const isOverdue = new Date() > new Date(advance.expires_at);

      // Read wallet balance from wallets table (Single-Writer principle)
      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', advance.agent_id)
        .maybeSingle();

      const walletBalance = wallet ? Number(wallet.balance) : 0;

      const maxDeduction = Math.min(walletBalance, balanceAfterInterest);
      const amountDeducted = Math.max(0, maxDeduction);
      const closingBalance = balanceAfterInterest - amountDeducted;

      let deductionStatus: string;
      if (amountDeducted >= balanceAfterInterest) {
        deductionStatus = 'full';
      } else if (amountDeducted > 0) {
        deductionStatus = 'partial';
      } else {
        deductionStatus = 'none';
      }

      // Record in advance ledger
      await supabase.from('agent_advance_ledger').insert({
        advance_id: advance.id,
        date: today,
        opening_balance: openingBalance,
        interest_accrued: interestAccrued,
        amount_deducted: amountDeducted,
        closing_balance: closingBalance,
        deduction_status: deductionStatus,
      });

      // Update advance status
      const newStatus = closingBalance <= 0 ? 'completed' : (isOverdue ? 'overdue' : 'active');
      await supabase.from('agent_advances').update({
        outstanding_balance: Math.max(0, closingBalance),
        status: newStatus,
      }).eq('id', advance.id);

      // Deduct from wallet via ledger (with transaction_group_id for sync trigger)
      if (amountDeducted > 0) {
        const txnGroupId = crypto.randomUUID();
        await supabase.from('general_ledger').insert({
          user_id: advance.agent_id,
          amount: amountDeducted,
          direction: 'cash_out',
          category: 'advance_repayment',
          source_table: 'agent_advances',
          source_id: advance.id,
          transaction_group_id: txnGroupId,
          description: `Advance daily deduction - Interest: ${interestAccrued}`,
      currency: 'UGX',
          transaction_date: today,
        });
      }

      results.push({
        advance_id: advance.id,
        agent_id: advance.agent_id,
        interest: interestAccrued,
        deducted: amountDeducted,
        closing: closingBalance,
        status: newStatus,
      });
    }

    return new Response(JSON.stringify({ processed: results.length, skipped: skipped.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
