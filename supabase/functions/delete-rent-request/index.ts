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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check manager role
    const { data: roles } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', caller.id).eq('role', 'manager').eq('enabled', true);
    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: 'Forbidden: Manager role required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { rent_request_id } = await req.json();
    if (!rent_request_id) {
      return new Response(JSON.stringify({ error: 'rent_request_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Delete in order: ledger entries, repayments, subscription charge logs, subscription charges, then rent request
    await supabaseAdmin.from('general_ledger').delete().eq('source_id', rent_request_id);
    await supabaseAdmin.from('repayments').delete().eq('rent_request_id', rent_request_id);
    
    // Delete subscription charge logs first (FK dependency)
    const { data: subs } = await supabaseAdmin.from('subscription_charges').select('id').eq('rent_request_id', rent_request_id);
    if (subs && subs.length > 0) {
      const subIds = subs.map(s => s.id);
      for (const subId of subIds) {
        await supabaseAdmin.from('subscription_charge_logs').delete().eq('subscription_id', subId);
      }
      await supabaseAdmin.from('subscription_charges').delete().eq('rent_request_id', rent_request_id);
    }

    // Delete supporter ROI payments linked to this request
    await supabaseAdmin.from('supporter_roi_payments').delete().eq('rent_request_id', rent_request_id);

    // Delete credit request details linked to this rent request (via loan linkage check)
    // Finally delete the rent request
    const { error: deleteError } = await supabaseAdmin.from('rent_requests').delete().eq('id', rent_request_id);
    if (deleteError) {
      console.error('Error deleting rent request:', deleteError);
      return new Response(JSON.stringify({ error: 'Failed to delete rent request: ' + deleteError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Delete rent request error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
