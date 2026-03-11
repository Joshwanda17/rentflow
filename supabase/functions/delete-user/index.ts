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

    // Verify the caller is a manager
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

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Validate UUID format
    if (typeof user_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user_id)) {
      return new Response(JSON.stringify({ error: 'Invalid user ID format' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Prevent self-deletion
    if (user_id === caller.id) {
      return new Response(JSON.stringify({ error: 'Cannot delete your own account' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // STEP 1: Kill the auth user FIRST to invalidate all sessions immediately.
    // This prevents the roleManager from re-provisioning roles during cleanup.
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);
    if (deleteError) {
      console.error('Error deleting auth user:', deleteError);
      return new Response(JSON.stringify({ error: 'Failed to delete auth user: ' + deleteError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // STEP 2: Now safely clean up all related data (user can no longer authenticate)
    await Promise.all([
      supabaseAdmin.from('user_roles').delete().eq('user_id', user_id),
      supabaseAdmin.from('wallets').delete().eq('user_id', user_id),
      supabaseAdmin.from('referrals').delete().or(`referrer_id.eq.${user_id},referred_id.eq.${user_id}`),
      supabaseAdmin.from('notifications').delete().eq('user_id', user_id),
      supabaseAdmin.from('ai_chat_messages').delete().eq('user_id', user_id),
      supabaseAdmin.from('push_subscriptions').delete().eq('user_id', user_id),
      supabaseAdmin.from('supporter_referrals').delete().or(`referrer_id.eq.${user_id},referred_id.eq.${user_id}`),
      supabaseAdmin.from('investment_withdrawal_requests').delete().eq('user_id', user_id),
      supabaseAdmin.from('credit_access_limits').delete().eq('user_id', user_id),
      supabaseAdmin.from('agent_earnings').delete().eq('agent_id', user_id),
      supabaseAdmin.from('earning_baselines').delete().eq('user_id', user_id),
      supabaseAdmin.from('earning_predictions').delete().eq('user_id', user_id),
      supabaseAdmin.from('deposit_requests').delete().eq('user_id', user_id),
      supabaseAdmin.from('cart_items').delete().eq('user_id', user_id),
    ]);

    // Unlink investor portfolios (preserve records for audit)
    await supabaseAdmin.from('investor_portfolios').update({ investor_id: null, status: 'cancelled' }).eq('investor_id', user_id);
    // Cancel supporter invites
    await supabaseAdmin.from('supporter_invites').update({ status: 'cancelled' }).eq('supporter_id', user_id);

    // Delete profile last (other FKs reference it)
    await supabaseAdmin.from('profiles').delete().eq('id', user_id);

    return new Response(JSON.stringify({ success: true, message: 'User deleted successfully' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Delete user error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
