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
      .eq('status', 'active');

    if (fetchError) throw fetchError;
    if (!advances || advances.length === 0) {
      return new Response(JSON.stringify({ message: 'No active advances to process' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];
    const today = new Date().toISOString().split('T')[0];

    for (const advance of advances) {
      const openingBalance = Number(advance.outstanding_balance);
      const interestAccrued = Math.round(openingBalance * DAILY_INTEREST_RATE);
      const balanceAfterInterest = openingBalance + interestAccrued;

      const isOverdue = new Date() > new Date(advance.expires_at);

      // Get agent wallet balance
      const { data: walletEntries } = await supabase
        .from('general_ledger')
        .select('amount, direction')
        .eq('user_id', advance.agent_id)
        .eq('category', 'wallet');

      let walletBalance = 0;
      if (walletEntries) {
        walletBalance = walletEntries.reduce((sum: number, e: any) => {
          return sum + (e.direction === 'credit' ? Number(e.amount) : -Number(e.amount));
        }, 0);
      }

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

      await supabase.from('agent_advance_ledger').insert({
        advance_id: advance.id,
        date: today,
        opening_balance: openingBalance,
        interest_accrued: interestAccrued,
        amount_deducted: amountDeducted,
        closing_balance: closingBalance,
        deduction_status: deductionStatus,
      });

      const newStatus = closingBalance <= 0 ? 'completed' : (isOverdue ? 'overdue' : 'active');
      await supabase.from('agent_advances').update({
        outstanding_balance: Math.max(0, closingBalance),
        status: newStatus,
      }).eq('id', advance.id);

      if (amountDeducted > 0) {
        await supabase.from('general_ledger').insert({
          user_id: advance.agent_id,
          amount: amountDeducted,
          direction: 'debit',
          category: 'advance_repayment',
          source_table: 'agent_advances',
          source_id: advance.id,
          description: `Agent advance daily deduction - Interest: ${interestAccrued}`,
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

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
