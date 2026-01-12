import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AGENT_APPROVAL_BONUS = 5000; // UGX 5,000

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
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const approverId = user.id;
    const { rent_request_id, action, approval_comment } = await req.json();

    // Default action to 'approve' if not specified (backwards compatibility)
    const requestAction = action || 'approve';

    console.log(`User ${approverId} ${requestAction} rent request ${rent_request_id}`);

    if (!rent_request_id) {
      return new Response(
        JSON.stringify({ error: 'Invalid request parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user is a manager or agent
    const { data: userRoles } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', approverId);

    const roles = userRoles?.map(r => r.role) || [];
    const isManager = roles.includes('manager');
    const isAgent = roles.includes('agent');

    if (!isManager && !isAgent) {
      return new Response(
        JSON.stringify({ error: 'Only managers and agents can approve/reject requests' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get rent request
    const { data: rentRequest } = await adminClient
      .from('rent_requests')
      .select('*')
      .eq('id', rent_request_id)
      .single();

    if (!rentRequest) {
      return new Response(
        JSON.stringify({ error: 'Rent request not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (rentRequest.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: 'Request is not pending' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (requestAction === 'approve') {
      // Update rent request status with approval comment
      await adminClient
        .from('rent_requests')
        .update({
          status: 'approved',
          approved_by: approverId,
          approved_at: new Date().toISOString(),
          approval_comment: approval_comment || null,
        })
        .eq('id', rent_request_id);

      // Pay agent approval bonus if agent exists and approver is a manager
      // (agents don't get bonus for their own approvals)
      if (rentRequest.agent_id && isManager) {
        // Get or create agent wallet
        let { data: agentWallet } = await adminClient
          .from('wallets')
          .select('*')
          .eq('user_id', rentRequest.agent_id)
          .maybeSingle();

        if (!agentWallet) {
          const { data: newWallet } = await adminClient
            .from('wallets')
            .insert({ user_id: rentRequest.agent_id, balance: 0 })
            .select()
            .single();
          agentWallet = newWallet;
        }

        // Credit agent bonus
        await adminClient
          .from('wallets')
          .update({ balance: (agentWallet?.balance || 0) + AGENT_APPROVAL_BONUS })
          .eq('user_id', rentRequest.agent_id);

        // Record agent earning
        await adminClient
          .from('agent_earnings')
          .insert({
            agent_id: rentRequest.agent_id,
            amount: AGENT_APPROVAL_BONUS,
            earning_type: 'approval_bonus',
            source_user_id: rentRequest.tenant_id,
            rent_request_id: rent_request_id,
            description: `UGX 5,000 bonus for approved tenant registration`,
          });

        // Get tenant name for notification
        const { data: tenantProfile } = await adminClient
          .from('profiles')
          .select('full_name')
          .eq('id', rentRequest.tenant_id)
          .single();

        // Notify agent of bonus
        await adminClient
          .from('notifications')
          .insert({
            user_id: rentRequest.agent_id,
            title: 'Approval Bonus Received!',
            message: `You earned UGX ${AGENT_APPROVAL_BONUS.toLocaleString()} for ${tenantProfile?.full_name}'s approved rent request.`,
            type: 'earning',
            metadata: { amount: AGENT_APPROVAL_BONUS, type: 'approval_bonus' },
          });

        console.log(`Agent ${rentRequest.agent_id} received UGX ${AGENT_APPROVAL_BONUS} bonus`);
      }

      // Get approver name
      const { data: approverProfile } = await adminClient
        .from('profiles')
        .select('full_name')
        .eq('id', approverId)
        .single();

      // Notify tenant
      const approverRole = isManager ? 'manager' : 'agent';
      await adminClient
        .from('notifications')
        .insert({
          user_id: rentRequest.tenant_id,
          title: 'Rent Request Approved!',
          message: `Your rent request for UGX ${rentRequest.rent_amount.toLocaleString()} has been approved by ${approverProfile?.full_name || approverRole}. Awaiting supporter funding.${approval_comment ? ` Note: ${approval_comment}` : ''}`,
          type: 'success',
        });

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Rent request approved successfully',
          agent_bonus_paid: rentRequest.agent_id && isManager ? AGENT_APPROVAL_BONUS : 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (requestAction === 'reject') {
      await adminClient
        .from('rent_requests')
        .update({ status: 'rejected' })
        .eq('id', rent_request_id);

      // Notify tenant
      await adminClient
        .from('notifications')
        .insert({
          user_id: rentRequest.tenant_id,
          title: 'Rent Request Rejected',
          message: `Your rent request for UGX ${rentRequest.rent_amount.toLocaleString()} was not approved.`,
          type: 'info',
        });

      return new Response(
        JSON.stringify({ success: true, message: 'Rent request rejected' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
