import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const results = {
      processed: 0,
      credited: 0,
      reinvested: 0,
      skipped: 0,
      totalAmount: 0,
      errors: [] as string[],
    };

    // Get all funded rent requests that have a supporter tagged
    const { data: fundedRequests, error: fetchError } = await supabase
      .from('rent_requests')
      .select('id, rent_amount, supporter_id, funded_at, next_roi_due_date, total_roi_paid, roi_payments_count')
      .not('supporter_id', 'is', null)
      .not('funded_at', 'is', null)
      .in('status', ['funded', 'disbursed', 'completed']);

    // Get supporters who have pending/approved withdrawal requests (rewards paused)
    const { data: pausedWithdrawals } = await supabase
      .from('investment_withdrawal_requests')
      .select('user_id')
      .eq('rewards_paused', true)
      .in('status', ['pending', 'approved']);

    const pausedSupporterIds = new Set(
      (pausedWithdrawals || []).map((w: any) => w.user_id)
    );

    // Get auto-reinvest preferences from portfolios
    const { data: reinvestPortfolios } = await supabase
      .from('investor_portfolios')
      .select('investor_id, id, auto_reinvest, investment_amount')
      .eq('auto_reinvest', true)
      .eq('status', 'active');

    const autoReinvestMap = new Map<string, { portfolio_id: string; current_amount: number }>();
    (reinvestPortfolios || []).forEach((p: any) => {
      if (p.investor_id && !autoReinvestMap.has(p.investor_id)) {
        autoReinvestMap.set(p.investor_id, { portfolio_id: p.id, current_amount: p.investment_amount });
      }
    });

    if (fetchError) {
      throw new Error(`Failed to fetch funded requests: ${fetchError.message}`);
    }

    console.log(`[process-supporter-roi] Found ${fundedRequests?.length || 0} funded requests to check`);

    for (const rr of fundedRequests || []) {
      try {
        if (pausedSupporterIds.has(rr.supporter_id)) {
          console.log(`[process-supporter-roi] Skipping ${rr.supporter_id} — rewards paused`);
          results.skipped++;
          continue;
        }

        const fundedDate = new Date(rr.funded_at);

        // Strict 30-day cycle
        if (rr.next_roi_due_date) {
          const dueDate = new Date(rr.next_roi_due_date);
          if (dueDate > now) { results.skipped++; continue; }
        } else {
          const firstDue = new Date(fundedDate.getTime() + 30 * 24 * 60 * 60 * 1000);
          if (firstDue > now) { results.skipped++; continue; }
        }

        results.processed++;

        const roiAmount = Math.round(Number(rr.rent_amount) * 0.15);
        const paymentNumber = (rr.roi_payments_count || 0) + 1;

        // Check auto-reinvest preference
        const reinvestInfo = autoReinvestMap.get(rr.supporter_id);
        const shouldReinvest = !!reinvestInfo;

        // Insert ROI payment record
        const { error: roiInsertError } = await supabase
          .from('supporter_roi_payments')
          .insert({
            rent_request_id: rr.id,
            supporter_id: rr.supporter_id,
            rent_amount: rr.rent_amount,
            roi_amount: roiAmount,
            payment_number: paymentNumber,
            due_date: now.toISOString(),
            paid_at: now.toISOString(),
            status: shouldReinvest ? 'reinvested' : 'paid',
          });

        if (roiInsertError) {
          if (roiInsertError.code === '23505') {
            console.log(`[process-supporter-roi] Already processed: ${rr.id} payment #${paymentNumber}`);
            continue;
          }
          throw roiInsertError;
        }

        const txGroupId = crypto.randomUUID();

        if (shouldReinvest) {
          // ═══ AUTO-REINVEST: Add ROI to portfolio instead of wallet ═══
          const newAmount = reinvestInfo.current_amount + roiAmount;

          // Update portfolio balance
          await supabase.from('investor_portfolios')
            .update({ investment_amount: newAmount })
            .eq('id', reinvestInfo.portfolio_id);

          // Ledger: platform expense for ROI
          await supabase.from('general_ledger').insert({
            user_id: null,
            amount: roiAmount,
            direction: 'cash_out',
            category: 'supporter_platform_rewards',
            source_table: 'supporter_roi_payments',
            source_id: rr.id,
            transaction_group_id: txGroupId,
            description: `ROI payout #${paymentNumber} auto-reinvested into portfolio`,
            linked_party: 'platform',
            ledger_scope: 'platform',
            transaction_date: now.toISOString(),
          });

          // Ledger: reinvestment credit (platform scope - not wallet)
          await supabase.from('general_ledger').insert({
            user_id: rr.supporter_id,
            amount: roiAmount,
            direction: 'cash_in',
            category: 'investment_reinvestment',
            source_table: 'investor_portfolios',
            source_id: reinvestInfo.portfolio_id,
            transaction_group_id: txGroupId,
            description: `Auto-reinvested ROI #${paymentNumber} (${roiAmount.toLocaleString()}) into portfolio`,
            linked_party: 'platform',
            ledger_scope: 'platform',
            transaction_date: now.toISOString(),
          });

          // Notify supporter
          await supabase.from('notifications').insert({
            user_id: rr.supporter_id,
            title: '🔄 ROI Auto-Reinvested!',
            message: `Your reward of UGX ${roiAmount.toLocaleString()} (payment #${paymentNumber}) has been automatically added to your portfolio. New balance: UGX ${newAmount.toLocaleString()}.`,
            type: 'earning',
            metadata: { portfolio_id: reinvestInfo.portfolio_id, roi_amount: roiAmount, payment_number: paymentNumber },
          });

          // Update the cached amount for subsequent iterations
          reinvestInfo.current_amount = newAmount;
          results.reinvested++;
        } else {
          // ═══ STANDARD WALLET CREDIT ═══
          // Debit: Platform expense
          await supabase.from('general_ledger').insert({
            user_id: null,
            amount: roiAmount,
            direction: 'cash_out',
            category: 'supporter_platform_rewards',
            source_table: 'supporter_roi_payments',
            source_id: rr.id,
            transaction_group_id: txGroupId,
            description: `Platform ROI payout #${paymentNumber} to supporter for rent facilitation of UGX ${Number(rr.rent_amount).toLocaleString()}`,
            linked_party: 'platform',
            ledger_scope: 'platform',
            transaction_date: now.toISOString(),
          });

          // Credit: Supporter wallet (triggers sync_wallet_from_ledger)
          await supabase.from('general_ledger').insert({
            user_id: rr.supporter_id,
            amount: roiAmount,
            direction: 'cash_in',
            category: 'supporter_platform_rewards',
            source_table: 'supporter_roi_payments',
            source_id: rr.id,
            transaction_group_id: txGroupId,
            description: `15% monthly reward (payment #${paymentNumber}) on rent facilitation of UGX ${Number(rr.rent_amount).toLocaleString()}`,
            linked_party: 'platform',
            ledger_scope: 'wallet',
            transaction_date: now.toISOString(),
          });

          await supabase.from('notifications').insert({
            user_id: rr.supporter_id,
            title: '💰 Monthly Reward Paid!',
            message: `Your 15% monthly reward of UGX ${roiAmount.toLocaleString()} (payment #${paymentNumber}) has been credited to your wallet.`,
            type: 'earning',
            metadata: { rent_request_id: rr.id, roi_amount: roiAmount, payment_number: paymentNumber },
          });

          results.credited++;
        }

        // Update rent request ROI tracking
        const nextDueDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        await supabase.from('rent_requests').update({
          next_roi_due_date: nextDueDate.toISOString(),
          total_roi_paid: (rr.total_roi_paid || 0) + roiAmount,
          roi_payments_count: paymentNumber,
        }).eq('id', rr.id);

        results.totalAmount += roiAmount;
        console.log(`[process-supporter-roi] ${shouldReinvest ? 'Reinvested' : 'Paid'} ${roiAmount} for supporter ${rr.supporter_id} (payment #${paymentNumber})`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[process-supporter-roi] Error on ${rr.id}:`, msg);
        results.errors.push(`${rr.id}: ${msg}`);
      }
    }

    console.log(`[process-supporter-roi] Done: ${results.credited} wallet-credited, ${results.reinvested} auto-reinvested, total: ${results.totalAmount}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.processed}: ${results.credited} wallet, ${results.reinvested} reinvested, ${results.skipped} skipped`,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[process-supporter-roi] Fatal:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
