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

    // Create general referral record for all roles
    await adminClient
      .from("referrals")
      .insert({
        referrer_id: invite.created_by,
        referred_id: authData.user.id,
        bonus_amount: 100,
        credited: true,
        credited_at: new Date().toISOString(),
      });

    // Credit manager's wallet for the referral
    const { data: walletData } = await adminClient
      .from("wallets")
      .select("balance")
      .eq("user_id", invite.created_by)
      .single();

    if (walletData) {
      await adminClient
        .from("wallets")
        .update({ balance: walletData.balance + 100 })
        .eq("user_id", invite.created_by);
    }

    const roleLabels: Record<string, string> = {
      tenant: 'Tenant',
      agent: 'Agent', 
      supporter: 'Supporter',
    };

    // Notify the manager
    await adminClient
      .from("notifications")
      .insert({
        user_id: invite.created_by,
        title: `🎉 ${roleLabels[userRole]} Activated!`,
        message: `${invite.full_name} has activated their ${userRole} account! You earned UGX 100 referral bonus.`,
        type: "success",
        metadata: { user_id: authData.user.id, invite_id: invite.id, role: userRole },
      });

    console.log(`Activated ${userRole} account for ${invite.email}`);

    return new Response(JSON.stringify({ 
      success: true,
      message: "Account activated successfully! You can now log in.",
      email: invite.email,
      role: userRole,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
