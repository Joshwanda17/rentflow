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
      skipped: 0,
      totalAmount: 0,
      errors: [] as string[],
    };

    // Get all funded rent requests that have a supporter tagged
    // and are eligible for ROI (funded_at is set)
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

    if (fetchError) {
      throw new Error(`Failed to fetch funded requests: ${fetchError.message}`);
    }

    console.log(`[process-supporter-roi] Found ${fundedRequests?.length || 0} funded requests to check`);

    for (const rr of fundedRequests || []) {
      try {
        // Skip supporters with active withdrawal requests (rewards paused)
        if (pausedSupporterIds.has(rr.supporter_id)) {
          console.log(`[process-supporter-roi] Skipping ${rr.supporter_id} — rewards paused (withdrawal requested)`);
          results.skipped++;
          continue;
        }

        const fundedDate = new Date(rr.funded_at);
        const fundedDayOfMonth = fundedDate.getDate();

        // ROI is due on the same day-of-month as funded_at
        // First payment: same day of the next month after funding
        // Check if today matches the supporter's unique anniversary day
        if (rr.next_roi_due_date) {
          const dueDate = new Date(rr.next_roi_due_date);
          if (dueDate > now) {
            results.skipped++;
            continue;
          }
        } else {
          // First ROI: check if at least one full month has passed
          const firstDue = new Date(fundedDate);
          firstDue.setMonth(firstDue.getMonth() + 1);
          // Handle day overflow (e.g. funded Jan 31 -> Feb 28)
          if (firstDue.getDate() !== fundedDayOfMonth) {
            firstDue.setDate(0); // last day of previous month
          }
          if (firstDue > now) {
            results.skipped++;
            continue;
          }
        }

        results.processed++;

        // 15% of the rent amount funded
        const roiAmount = Math.round(Number(rr.rent_amount) * 0.15);
        const paymentNumber = (rr.roi_payments_count || 0) + 1;

        // Insert ROI payment record (unique constraint prevents duplicates)
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
            status: 'paid',
          });

        if (roiInsertError) {
          if (roiInsertError.code === '23505') {
            console.log(`[process-supporter-roi] Already processed: ${rr.id} payment #${paymentNumber}`);
            continue;
          }
          throw roiInsertError;
        }

        // Credit supporter wallet via ledger (pending_wallet_operations for manager approval)
        const txGroupId = crypto.randomUUID();
        await supabase.from('pending_wallet_operations').insert({
          user_id: rr.supporter_id,
          amount: roiAmount,
          direction: 'cash_in',
          category: 'supporter_platform_rewards',
          source_table: 'supporter_roi_payments',
          source_id: rr.id,
          transaction_group_id: txGroupId,
          description: `15% monthly reward (payment #${paymentNumber}) on rent facilitation of UGX ${Number(rr.rent_amount).toLocaleString()}`,
          linked_party: 'platform',
          status: 'pending',
        });

        // Update rent request ROI tracking - next due is same day next month
        const fundedDay = new Date(rr.funded_at).getDate();
        const nextDueDate = new Date(now);
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        // Handle day overflow (e.g. day 31 in a 30-day month)
        if (nextDueDate.getDate() !== fundedDay) {
          nextDueDate.setDate(0); // last day of that month
        }

        await supabase
          .from('rent_requests')
          .update({
            next_roi_due_date: nextDueDate.toISOString(),
            total_roi_paid: (rr.total_roi_paid || 0) + roiAmount,
            roi_payments_count: paymentNumber,
          })
          .eq('id', rr.id);

        // Notify supporter
        await supabase.from('notifications').insert({
          user_id: rr.supporter_id,
          title: '💰 Monthly Reward Credited!',
          message: `Your 15% monthly reward of UGX ${roiAmount.toLocaleString()} (payment #${paymentNumber}) is pending manager approval.`,
          type: 'earning',
          metadata: {
            rent_request_id: rr.id,
            roi_amount: roiAmount,
            payment_number: paymentNumber,
          },
        });

        results.credited++;
        results.totalAmount += roiAmount;

        console.log(`[process-supporter-roi] Queued ${roiAmount} for supporter ${rr.supporter_id} (payment #${paymentNumber})`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[process-supporter-roi] Error on ${rr.id}:`, msg);
        results.errors.push(`${rr.id}: ${msg}`);
      }
    }

    console.log(`[process-supporter-roi] Done: ${results.credited} credited, total: ${results.totalAmount}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.processed}, credited ${results.credited}, skipped ${results.skipped} (not yet due)`,
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
