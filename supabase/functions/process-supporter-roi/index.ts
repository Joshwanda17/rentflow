import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PaymentProof {
  id: string;
  supporter_id: string;
  amount: number;
  verified_at: string;
  next_roi_due_date: string | null;
  total_roi_paid: number;
  roi_payments_count: number;
  supporter?: {
    full_name: string;
  };
}

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
      totalAmount: 0,
      errors: [] as string[],
    };

    // Get all verified payment proofs that are due for ROI payment
    // Either next_roi_due_date is null (first payment after 30 days from verification)
    // Or next_roi_due_date has passed
    const { data: duePayments, error: fetchError } = await supabase
      .from('landlord_payment_proofs')
      .select(`
        id,
        supporter_id,
        amount,
        verified_at,
        next_roi_due_date,
        total_roi_paid,
        roi_payments_count,
        supporter:profiles!landlord_payment_proofs_supporter_id_fkey(full_name)
      `)
      .eq('status', 'verified')
      .or(`next_roi_due_date.is.null,next_roi_due_date.lte.${now.toISOString()}`);

    if (fetchError) {
      throw new Error(`Failed to fetch due payments: ${fetchError.message}`);
    }

    console.log(`Found ${duePayments?.length || 0} payments to process`);

    for (const payment of (duePayments as unknown as PaymentProof[]) || []) {
      try {
        // Calculate the due date
        let dueDate: Date;
        if (payment.next_roi_due_date) {
          dueDate = new Date(payment.next_roi_due_date);
        } else {
          // First ROI payment: 30 days after verification
          dueDate = new Date(payment.verified_at);
          dueDate.setDate(dueDate.getDate() + 30);
        }

        // Check if it's actually due
        if (dueDate > now) {
          continue;
        }

        results.processed++;

        // Calculate ROI (15% of rent amount)
        const roiAmount = Math.round(payment.amount * 0.15);
        const paymentNumber = (payment.roi_payments_count || 0) + 1;

        // Create ROI payment record
        const { error: roiInsertError } = await supabase
          .from('supporter_roi_payments')
          .insert({
            payment_proof_id: payment.id,
            supporter_id: payment.supporter_id,
            rent_amount: payment.amount,
            roi_amount: roiAmount,
            payment_number: paymentNumber,
            due_date: dueDate.toISOString(),
            paid_at: now.toISOString(),
            status: 'paid',
          });

        if (roiInsertError) {
          // Check if it's a duplicate (already processed)
          if (roiInsertError.code === '23505') {
            console.log(`Payment ${payment.id} already processed for period ${paymentNumber}`);
            continue;
          }
          throw roiInsertError;
        }

        // Credit supporter wallet
        const { data: walletData } = await supabase
          .from('wallets')
          .select('balance')
          .eq('user_id', payment.supporter_id)
          .single();

        if (walletData) {
          const newBalance = (walletData.balance || 0) + roiAmount;
          await supabase
            .from('wallets')
            .update({ balance: newBalance, updated_at: now.toISOString() })
            .eq('user_id', payment.supporter_id);
        }

        // Calculate next ROI due date (30 days from current due date)
        const nextDueDate = new Date(dueDate);
        nextDueDate.setDate(nextDueDate.getDate() + 30);

        // Update payment proof with new tracking info
        await supabase
          .from('landlord_payment_proofs')
          .update({
            last_roi_payment_at: now.toISOString(),
            next_roi_due_date: nextDueDate.toISOString(),
            total_roi_paid: (payment.total_roi_paid || 0) + roiAmount,
            roi_payments_count: paymentNumber,
          })
          .eq('id', payment.id);

        // Send notification to supporter
        const supporterName = payment.supporter?.full_name || 'Supporter';
        await supabase.from('notifications').insert({
          user_id: payment.supporter_id,
          title: '💰 Monthly ROI Credited!',
          message: `Your monthly ROI of UGX ${roiAmount.toLocaleString()} has been credited to your wallet. This is payment #${paymentNumber} from your rent facilitation of UGX ${payment.amount.toLocaleString()}.`,
          type: 'earning',
          metadata: {
            payment_proof_id: payment.id,
            roi_amount: roiAmount,
            payment_number: paymentNumber,
            total_roi_paid: (payment.total_roi_paid || 0) + roiAmount,
          },
        });

        results.credited++;
        results.totalAmount += roiAmount;

        console.log(`Credited ${roiAmount} to supporter ${payment.supporter_id} (payment #${paymentNumber})`);
      } catch (paymentError: any) {
        console.error(`Error processing payment ${payment.id}:`, paymentError);
        results.errors.push(`Payment ${payment.id}: ${paymentError.message}`);
      }
    }

    console.log(`Processing complete: ${results.credited} payments credited, total: ${results.totalAmount}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.processed} payments, credited ${results.credited}`,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('ROI processing error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
