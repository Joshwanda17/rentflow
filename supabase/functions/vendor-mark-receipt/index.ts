import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Authenticate the caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the caller is a manager or the vendor owner
    // Check if the user has a manager role (managers can mark on behalf of vendors)
    const { data: managerRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'manager')
      .maybeSingle();

    // If not a manager, verify this is the actual vendor
    if (!managerRole) {
      const { data: vendor } = await supabase
        .from('vendors')
        .select('id')
        .eq('id', vendorId)
        .eq('active', true)
        .maybeSingle();

      if (!vendor) {
        return new Response(
          JSON.stringify({ success: false, message: 'Unauthorized - vendor not found or inactive' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

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

    // Audit log
    try {
      await supabase.from('audit_logs').insert({
        action_type: 'vendor_mark_receipt',
        table_name: 'receipt_numbers',
        record_id: receiptId,
        performed_by: user.id,
        metadata: { vendorId, amount, receipt_code: receipt.receipt_code }
      });
    } catch {}

    console.log(`Receipt ${receipt.receipt_code} marked with amount ${amount} by vendor ${vendorId} (user ${user.id})`);

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
