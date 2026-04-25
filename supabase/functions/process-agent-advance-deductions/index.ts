import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkTreasuryGuard } from "../_shared/treasuryGuard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_MONTHLY_RATE = 0.33;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Treasury guard: cron deductions must respect maintenance freeze
    const guardBlock = await checkTreasuryGuard(supabase, "any");
    if (guardBlock) return guardBlock;

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

      const advanceMonthlyRate = Number(advance.monthly_rate) || Number(advance.daily_rate) || DEFAULT_MONTHLY_RATE;
      const dailyInterestRate = Math.pow(1 + advanceMonthlyRate, 1 / 30) - 1;

      const openingBalance = Number(advance.outstanding_balance);
      const interestAccrued = Math.round(openingBalance * dailyInterestRate);
      const balanceAfterInterest = openingBalance + interestAccrued;

      const isOverdue = new Date() > new Date(advance.expires_at);

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
      if (amountDeducted >= balanceAfterInterest) deductionStatus = 'full';
      else if (amountDeducted > 0) deductionStatus = 'partial';
      else deductionStatus = 'none';

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
      const advAccessFee = Number(advance.access_fee || 0);
      const totalPayable = Number(advance.principal) + advAccessFee;
      const totalDeducted = totalPayable - Math.max(0, closingBalance);
      const feeCollectionRatio = totalPayable > 0 ? Math.min(1, totalDeducted / totalPayable) : 0;
      const newFeeCollected = Math.round(advAccessFee * feeCollectionRatio);
      const feeStatus = newFeeCollected >= advAccessFee ? 'settled' : newFeeCollected > 0 ? 'partial' : 'unpaid';

      await supabase.from('agent_advances').update({
        outstanding_balance: Math.max(0, closingBalance),
        status: newStatus,
        access_fee_collected: newFeeCollected,
        access_fee_status: feeStatus,
      }).eq('id', advance.id);

      // Deduct from wallet via balanced RPC
      if (amountDeducted > 0) {
        const { error: rpcErr } = await supabase.rpc('create_ledger_transaction', {
          entries: [
            {
              user_id: advance.agent_id,
              ledger_scope: 'wallet',
              direction: 'cash_out',
              amount: amountDeducted,
              category: 'agent_repayment',
              source_table: 'agent_advances',
              source_id: advance.id,
              description: `Advance daily deduction - Interest: ${interestAccrued}`,
              currency: 'UGX',
              transaction_date: today,
            },
          {
            user_id: advance.agent_id,
            ledger_scope: 'platform',
            direction: 'cash_in',
            amount: amountDeducted,
            category: 'agent_repayment',
            source_table: 'agent_advances',
            source_id: advance.id,
            description: `Advance repayment received from agent`,
            currency: 'UGX',
            transaction_date: today,
          },
          ],
        });
        if (rpcErr) console.error(`[process-agent-advance-deductions] RPC error for advance ${advance.id}:`, rpcErr);
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
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
