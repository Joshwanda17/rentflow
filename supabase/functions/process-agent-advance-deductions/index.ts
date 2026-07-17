import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkTreasuryGuard } from "../_shared/treasuryGuard.ts";
import { attemptYoolaPrimary } from "../_shared/yoolaPrimary.ts";

const fmtUGX = (n: number) => `UGX ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

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

    // Build a phone/name map once so we can notify agents without an extra
    // query per advance.
    const agentIds = Array.from(new Set(advances.map((a) => a.agent_id).filter(Boolean)));
    const phoneMap = new Map<string, { phone: string | null; name: string | null }>();
    if (agentIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, phone, full_name')
        .in('id', agentIds);
      for (const p of profs || []) {
        phoneMap.set(p.id, { phone: p.phone, name: p.full_name });
      }
    }
    const notifyAgent = async (agentId: string, message: string, source: string) => {
      const info = phoneMap.get(agentId);
      if (!info?.phone) return;
      try {
        await attemptYoolaPrimary(info.phone, message, {
          source,
          recipientUserId: agentId,
          recipientName: info.name ?? undefined,
        });
      } catch (_e) { /* SMS failure never blocks deductions */ }
    };

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

      // STRICT: read withdrawable-only figure (Wallet Withdrawable Strict Rule).
      // Never read wallets.balance — that aggregate includes float/commission
      // custody money that must NEVER be touched for advance recovery.
      const { data: availRaw, error: availErr } = await supabase
        .rpc('get_user_available_balance', { p_user_id: advance.agent_id });
      if (availErr) console.error(`[process-agent-advance-deductions] available_balance error for agent ${advance.agent_id}:`, availErr);
      const withdrawableSnapshot = Math.max(0, Number(availRaw ?? 0));

      // emit repayment_attempted
      await supabase.from('system_events').insert({
        event_type: 'repayment_attempted',
        payload: {
          source: 'cron_advance_deduction',
          advance_id: advance.id,
          user_id: advance.agent_id,
          outstanding_after_interest: balanceAfterInterest,
          withdrawable_snapshot: withdrawableSnapshot,
        },
      }).then(() => {}, () => {});

      // Cap daily deduction at scheduled installment + any accrued arrears.
      // Never scoop the agent's whole withdrawable in a single day — the
      // schedule is `principal + access_fee` spread over cycle_days.
      const cycleDaysCap = Number(advance.cycle_days) || 30;
      const totalPayableCap =
        Number(advance.principal) + Number(advance.access_fee || 0);
      const scheduledDailyCap =
        cycleDaysCap > 0 ? Math.round(totalPayableCap / cycleDaysCap) : 0;
      const arrearsCap = Math.max(0, Number(advance.arrears_balance || 0));
      const dailyCap = Math.max(0, scheduledDailyCap + arrearsCap);

      const maxDeduction = Math.min(
        withdrawableSnapshot,
        balanceAfterInterest,
        dailyCap > 0 ? dailyCap : balanceAfterInterest,
      );
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

      // Arrears accrual: track missed scheduled daily repayments so the credit-time
      // recovery trigger can claw them back from the agent's NEXT earning before it
      // becomes withdrawable. Meeting/exceeding today's installment pays arrears down;
      // missing it grows arrears. Arrears can never exceed what is still owed.
      const cycleDays = Number(advance.cycle_days) || 30;
      const scheduledDaily = cycleDays > 0 ? Math.round(totalPayable / cycleDays) : 0;
      const currentArrears = Number(advance.arrears_balance || 0);
      let newArrears: number;
      if (amountDeducted >= scheduledDaily) {
        newArrears = Math.max(0, currentArrears - (amountDeducted - scheduledDaily));
      } else {
        newArrears = currentArrears + (scheduledDaily - amountDeducted);
      }
      newArrears = Math.min(newArrears, Math.max(0, closingBalance));

      await supabase.from('agent_advances').update({
        outstanding_balance: Math.max(0, closingBalance),
        status: newStatus,
        access_fee_collected: newFeeCollected,
        access_fee_status: feeStatus,
        arrears_balance: newArrears,
      }).eq('id', advance.id);

      if (amountDeducted <= 0) {
        // Skipped — no withdrawable to recover from. Float is intentionally untouched.
        await supabase.from('system_events').insert({
          event_type: 'repayment_skipped_insufficient_balance',
          payload: {
            source: 'cron_advance_deduction',
            advance_id: advance.id,
            user_id: advance.agent_id,
            withdrawable_snapshot: withdrawableSnapshot,
            outstanding_after_interest: balanceAfterInterest,
          },
        }).then(() => {}, () => {});
        // Notify the agent that today's installment could not be collected and
        // will be recovered automatically from their next earnings.
        await notifyAgent(
          advance.agent_id,
          `WELILE: Today's advance repayment could not be collected (low wallet balance). Outstanding ${fmtUGX(closingBalance)}. It will be auto-recovered from your next earnings. Top up to avoid arrears.`,
          'advance_deduction_missed',
        );
      } else {
        // Deduct from wallet via balanced RPC with EXPLICIT Wallet Routing v2 tags.
        // wallet leg → recipient_type='user' forces withdrawable bucket;
        // platform leg → recipient_type='operational_wallet'.
        const repaymentMeta = {
          source: 'cron_advance_deduction',
          advance_id: advance.id,
          withdrawable_snapshot: withdrawableSnapshot,
          bucket_intent: 'advance_balance_recovery',
        };
        const { error: rpcErr } = await supabase.rpc('create_ledger_transaction', {
          entries: [
            {
              user_id: advance.agent_id,
              ledger_scope: 'wallet',
              direction: 'cash_out',
              amount: amountDeducted,
              category: 'agent_repayment',
              recipient_type: 'user',
              source_table: 'agent_advances',
              source_id: advance.id,
              description: `Advance daily deduction - Interest: ${interestAccrued}`,
              currency: 'UGX',
              transaction_date: today,
              metadata: repaymentMeta,
            },
          {
            user_id: advance.agent_id,
            ledger_scope: 'platform',
            direction: 'cash_in',
            amount: amountDeducted,
            category: 'agent_repayment',
            recipient_type: 'operational_wallet',
            source_table: 'agent_advances',
            source_id: advance.id,
            description: `Advance repayment received from agent`,
            currency: 'UGX',
            transaction_date: today,
            metadata: repaymentMeta,
          },
          ],
        });
        if (rpcErr) {
          console.error(`[process-agent-advance-deductions] RPC error for advance ${advance.id}:`, rpcErr);
          await supabase.from('system_events').insert({
            event_type: 'repayment_failed',
            payload: { ...repaymentMeta, user_id: advance.agent_id, error: String(rpcErr.message ?? rpcErr) },
          }).then(() => {}, () => {});
        } else {
          await supabase.from('system_events').insert({
            event_type: 'repayment_successful',
            payload: { ...repaymentMeta, user_id: advance.agent_id, amount: amountDeducted },
          }).then(() => {}, () => {});
          // Notify the agent where the money went (also visible in transactions).
          await notifyAgent(
            advance.agent_id,
            `WELILE: ${fmtUGX(amountDeducted)} was deducted from your wallet today towards your advance. Remaining balance ${fmtUGX(closingBalance)}. See your transactions for details.`,
            'advance_deduction_success',
          );
        }
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
