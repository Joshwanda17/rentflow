import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const validRoles = ['tenant', 'agent', 'supporter', 'landlord', 'manager'];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Get the authorization header to verify the user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create client with user's token to verify identity
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is a manager OR agent (both can create invites)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["manager", "agent"]);

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Only managers and agents can create user invites" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const creatorRole = roleData[0].role;

    const { email, fullName, phone, password, role = 'tenant', isSubAgent = false } = await req.json();

    if (!email || !fullName || !phone || !password) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!validRoles.includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid role. Must be tenant, agent, supporter, landlord, or manager" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Agents can create tenant, landlord, agent (sub-agent), and supporter accounts
    if (creatorRole === 'agent' && !['tenant', 'landlord', 'agent', 'supporter'].includes(role)) {
      return new Response(JSON.stringify({ error: "Agents can only create tenant, landlord, sub-agent, and supporter accounts" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only managers can create manager accounts
    if (role === 'manager' && creatorRole !== 'manager') {
      return new Response(JSON.stringify({ error: "Only managers can create manager accounts" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize phone number for comparison (remove all non-digits)
    const normalizedPhone = phone.replace(/\D/g, '');
    
    // Generate phone variants to check (with/without country code, with/without leading 0)
    const phoneVariants: string[] = [normalizedPhone];
    
    // If starts with country code 256, also check without it
    if (normalizedPhone.startsWith('256') && normalizedPhone.length > 9) {
      phoneVariants.push(normalizedPhone.slice(3)); // without 256
      phoneVariants.push('0' + normalizedPhone.slice(3)); // with leading 0
    }
    // If starts with 0, also check without it and with 256
    if (normalizedPhone.startsWith('0') && normalizedPhone.length >= 10) {
      phoneVariants.push(normalizedPhone.slice(1)); // without 0
      phoneVariants.push('256' + normalizedPhone.slice(1)); // with 256
    }
    // If doesn't start with 0 or 256, add variants
    if (!normalizedPhone.startsWith('0') && !normalizedPhone.startsWith('256') && normalizedPhone.length >= 9) {
      phoneVariants.push('0' + normalizedPhone);
      phoneVariants.push('256' + normalizedPhone);
    }

    // Check if phone already exists in profiles
    const { data: existingProfiles } = await adminClient
      .from("profiles")
      .select("id, phone")
      .limit(1000);
    
    if (existingProfiles) {
      for (const profile of existingProfiles) {
        const profilePhone = profile.phone?.replace(/\D/g, '') || '';
        if (phoneVariants.some(v => profilePhone.includes(v) || v.includes(profilePhone))) {
          return new Response(JSON.stringify({ error: "A user with this phone number already exists" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Check if phone exists in pending invites
    const { data: existingInviteWithPhone } = await adminClient
      .from("supporter_invites")
      .select("id, phone")
      .eq("status", "pending")
      .limit(1000);
    
    if (existingInviteWithPhone) {
      for (const invite of existingInviteWithPhone) {
        const invitePhone = invite.phone?.replace(/\D/g, '') || '';
        if (phoneVariants.some(v => invitePhone.includes(v) || v.includes(invitePhone))) {
          return new Response(JSON.stringify({ error: "An invite with this phone number already exists" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Check if email already exists in auth
    const { data: existingUsers, error: listUsersError } = await adminClient.auth.admin.listUsers();
    
    if (listUsersError) {
      console.error("Error listing users:", listUsersError);
      return new Response(JSON.stringify({ error: "Failed to check existing users" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const emailExists = existingUsers?.users?.some(u => u.email?.toLowerCase() === email.toLowerCase());
    
    if (emailExists) {
      return new Response(JSON.stringify({ error: "A user with this email already exists" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if invite already exists
    const { data: existingInvite } = await adminClient
      .from("supporter_invites")
      .select("id")
      .eq("email", email)
      .eq("status", "pending")
      .single();

    if (existingInvite) {
      return new Response(JSON.stringify({ error: "An invite for this email already exists" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create the invite record
    const { data: invite, error: inviteError } = await adminClient
      .from("supporter_invites")
      .insert({
        email,
        full_name: fullName,
        phone,
        temp_password: password,
        role,
        created_by: user.id,
      })
      .select()
      .single();

    if (inviteError) {
      console.error("Invite error:", inviteError);
      return new Response(JSON.stringify({ error: "Failed to create invite" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If this is a sub-agent being created by an agent, store the relationship info
    // The actual relationship will be created when the sub-agent activates their account
    // We'll store this in the invite metadata for now
    let subAgentParentId: string | null = null;
    if (creatorRole === 'agent' && role === 'agent' && isSubAgent) {
      subAgentParentId = user.id;
      console.log(`Creating sub-agent invite for ${email} with parent agent ${user.id}`);
    }

    console.log(`Created ${role} invite for ${email} by ${creatorRole} ${user.id}${subAgentParentId ? ' (sub-agent)' : ''}`);

    return new Response(JSON.stringify({ 
      success: true, 
      invite: {
        id: invite.id,
        activation_token: invite.activation_token,
        email: invite.email,
        full_name: invite.full_name,
        role: invite.role,
        parent_agent_id: subAgentParentId,
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error creating invite:", error);
    return new Response(JSON.stringify({ 
      error: error.message || "Internal server error",
      details: error.toString()
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
