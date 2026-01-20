import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { token, password } = await req.json();

    if (!token || !password) {
      return new Response(JSON.stringify({ error: "Missing token or password" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the invite
    const { data: invite, error: inviteError } = await adminClient
      .from("supporter_invites")
      .select("*")
      .eq("activation_token", token)
      .eq("status", "pending")
      .single();

    if (inviteError || !invite) {
      return new Response(JSON.stringify({ error: "Invalid or expired activation link" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify password matches
    if (password !== invite.temp_password) {
      return new Response(JSON.stringify({ error: "Incorrect password" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userRole = invite.role || 'supporter';

    // Check if the creator is an agent (for sub-agent creation)
    let isSubAgent = false;
    let parentAgentId: string | null = null;
    
    if (userRole === 'agent') {
      const { data: creatorRoles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", invite.created_by)
        .eq("role", "agent")
        .single();
      
      if (creatorRoles) {
        isSubAgent = true;
        parentAgentId = invite.created_by;
      }
    }

    // Create the user account
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: invite.email,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: invite.full_name,
        phone: invite.phone,
        role: userRole,
        referrer_id: invite.created_by,
      },
    });

    if (authError) {
      console.error("Auth error:", authError);
      return new Response(JSON.stringify({ error: "Failed to create account: " + authError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Add user role
    const { error: roleError } = await adminClient
      .from("user_roles")
      .insert({
        user_id: authData.user.id,
        role: userRole,
      });

    if (roleError) {
      console.error("Role error:", roleError);
    }

    // If this is a sub-agent, create the sub-agent relationship
    if (isSubAgent && parentAgentId) {
      const { error: subAgentError } = await adminClient
        .from("agent_subagents")
        .insert({
          parent_agent_id: parentAgentId,
          sub_agent_id: authData.user.id,
        });

      if (subAgentError) {
        console.error("Sub-agent relationship error:", subAgentError);
      } else {
        console.log(`Created sub-agent relationship: ${authData.user.id} under ${parentAgentId}`);
      }
    }

    // Update invite status
    await adminClient
      .from("supporter_invites")
      .update({
        status: "activated",
        activated_at: new Date().toISOString(),
        activated_user_id: authData.user.id,
      })
      .eq("id", invite.id);

    // Create supporter referral record only for supporters
    if (userRole === 'supporter') {
      await adminClient
        .from("supporter_referrals")
        .insert({
          referrer_id: invite.created_by,
          referred_id: authData.user.id,
          bonus_amount: 500,
        });
    }

    // Determine referral bonus - UGX 500 for direct registrations (via invite link)
    const referralBonus = 500;

    // Create general referral record for all roles
    await adminClient
      .from("referrals")
      .insert({
        referrer_id: invite.created_by,
        referred_id: authData.user.id,
        bonus_amount: referralBonus,
        credited: true,
        credited_at: new Date().toISOString(),
      });

    // Credit creator's wallet for the referral
    const { data: walletData } = await adminClient
      .from("wallets")
      .select("balance")
      .eq("user_id", invite.created_by)
      .single();

    if (walletData) {
      await adminClient
        .from("wallets")
        .update({ balance: walletData.balance + referralBonus })
        .eq("user_id", invite.created_by);
    }

    // Also credit agent_earnings for agents
    const { data: creatorIsAgent } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", invite.created_by)
      .eq("role", "agent")
      .single();

    if (creatorIsAgent) {
      await adminClient
        .from("agent_earnings")
        .insert({
          agent_id: invite.created_by,
          amount: referralBonus,
          earning_type: 'referral_bonus',
          description: isSubAgent ? 'Sub-agent registration bonus' : 'New member registration bonus',
          source_user_id: authData.user.id,
        });
    }

    const roleLabels: Record<string, string> = {
      tenant: 'Tenant',
      agent: 'Agent', 
      supporter: 'Supporter',
      landlord: 'Landlord',
    };

    // Notify the creator
    await adminClient
      .from("notifications")
      .insert({
        user_id: invite.created_by,
        title: `🎉 ${isSubAgent ? 'Sub-Agent' : roleLabels[userRole]} Activated!`,
        message: isSubAgent 
          ? `${invite.full_name} has joined your team as a sub-agent! You'll earn 1% of their tenants' repayments.`
          : `${invite.full_name} has activated their ${userRole} account! You earned UGX ${referralBonus} referral bonus.`,
        type: "success",
        metadata: { user_id: authData.user.id, invite_id: invite.id, role: userRole, is_sub_agent: isSubAgent },
      });

    console.log(`Activated ${isSubAgent ? 'sub-agent' : userRole} account for ${invite.email}`);

    return new Response(JSON.stringify({ 
      success: true,
      message: "Account activated successfully! You can now log in.",
      email: invite.email,
      role: userRole,
      isSubAgent,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error activating account:", error);
    return new Response(JSON.stringify({ 
      error: error.message || "Internal server error",
      details: error.toString()
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
