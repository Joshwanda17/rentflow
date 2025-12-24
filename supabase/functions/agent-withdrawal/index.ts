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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agentId = user.id;
    const { user_id, amount, user_phone } = await req.json();

    console.log(`Agent ${agentId} processing withdrawal for user ${user_id || user_phone}, amount: ${amount}`);

    if ((!user_id && !user_phone) || !amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid request parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify agent role
    const { data: agentRole } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', agentId)
      .eq('role', 'agent')
      .maybeSingle();

    if (!agentRole) {
      return new Response(
        JSON.stringify({ error: 'Only agents can process withdrawals' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find user by phone if not provided user_id
    let targetUserId = user_id;
    if (!targetUserId && user_phone) {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('id')
        .eq('phone', user_phone)
        .maybeSingle();
      
      if (!profile) {
        return new Response(
          JSON.stringify({ error: 'User not found with this phone number' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      targetUserId = profile.id;
    }

    // Get user's wallet
    const { data: userWallet } = await adminClient
      .from('wallets')
      .select('*')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (!userWallet) {
      return new Response(
        JSON.stringify({ error: 'User wallet not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (userWallet.balance < amount) {
      return new Response(
        JSON.stringify({ error: 'Insufficient balance' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deduct from user's wallet
    await adminClient
      .from('wallets')
      .update({ balance: userWallet.balance - amount })
      .eq('user_id', targetUserId);

    // Record withdrawal
    await adminClient
      .from('wallet_withdrawals')
      .insert({
        user_id: targetUserId,
        agent_id: agentId,
        amount: amount,
      });

    // Get user profile for response
    const { data: userProfile } = await adminClient
      .from('profiles')
      .select('full_name')
      .eq('id', targetUserId)
      .single();

    console.log(`Withdrawal completed: User ${targetUserId}, Amount: ${amount}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Withdrawal completed successfully',
        details: {
          amount: amount,
          user_name: userProfile?.full_name,
          new_balance: userWallet.balance - amount,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
