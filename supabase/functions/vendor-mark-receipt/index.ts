import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { vendorId, receiptId, amount } = await req.json();

    if (!vendorId || !receiptId || !amount) {
      return new Response(
        JSON.stringify({ success: false, message: 'Vendor ID, receipt ID, and amount are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (amount <= 0) {
      return new Response(
        JSON.stringify({ success: false, message: 'Amount must be positive' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the receipt belongs to this vendor and is available
    const { data: receipt, error: fetchError } = await supabase
      .from('receipt_numbers')
      .select('*')
      .eq('id', receiptId)
      .eq('vendor_id', vendorId)
      .maybeSingle();

    if (fetchError) {
      console.error('Fetch error:', fetchError);
      return new Response(
        JSON.stringify({ success: false, message: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!receipt) {
      return new Response(
        JSON.stringify({ success: false, message: 'Receipt not found or does not belong to this vendor' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (receipt.status !== 'available') {
      return new Response(
        JSON.stringify({ success: false, message: `Receipt already ${receipt.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark the receipt
    const { error: updateError } = await supabase
      .from('receipt_numbers')
      .update({
        vendor_amount: amount,
        status: 'marked',
        vendor_marked_at: new Date().toISOString()
      })
      .eq('id', receiptId);

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ success: false, message: 'Failed to mark receipt' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Receipt ${receipt.receipt_code} marked with amount ${amount} by vendor ${vendorId}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Receipt marked successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
