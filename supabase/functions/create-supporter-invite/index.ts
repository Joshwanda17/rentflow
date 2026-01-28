import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // Include all headers the browser/Supabase client may send
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const validRoles = ['tenant', 'agent', 'supporter', 'landlord', 'manager'];

// Normalize phone numbers for duplicate checks.
// We compare by the last 9 digits (UG local number) to avoid false matches from string "includes".
const toDigits = (value: string) => value.replace(/\D/g, "");
const ugLocal9 = (value: string) => {
  const digits = toDigits(value);
  if (!digits) return null;
  const last9 = digits.length >= 9 ? digits.slice(-9) : digits;
  return last9.length === 9 ? last9 : null;
};
const unique = <T,>(arr: T[]) => Array.from(new Set(arr));

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

    const local9 = ugLocal9(phone);
    if (!local9) {
      return new Response(JSON.stringify({ error: "Invalid phone number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Targeted phone duplicate check: only fetch rows that contain the last-9 digits.
    // Then compare by last-9 equality to prevent false positives.
    const { data: profilesMaybeWithPhone, error: profilesPhoneError } = await adminClient
      .from("profiles")
      .select("id, phone")
      .ilike("phone", `%${local9}%`)
      .limit(50);

    if (profilesPhoneError) {
      console.error("Phone check (profiles) error:", profilesPhoneError);
      return new Response(JSON.stringify({ error: "Failed to validate phone number" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profilesMaybeWithPhone?.some((p) => ugLocal9(p.phone ?? "") === local9)) {
      return new Response(JSON.stringify({ error: "A user with this phone number already exists" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: invitesMaybeWithPhone, error: invitesPhoneError } = await adminClient
      .from("supporter_invites")
      .select("id, phone")
      .eq("status", "pending")
      .ilike("phone", `%${local9}%`)
      .limit(50);

    if (invitesPhoneError) {
      console.error("Phone check (invites) error:", invitesPhoneError);
      return new Response(JSON.stringify({ error: "Failed to validate phone number" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (invitesMaybeWithPhone?.some((i) => ugLocal9(i.phone ?? "") === local9)) {
      return new Response(JSON.stringify({ error: "An invite with this phone number already exists" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if email already exists (profiles is our source of truth for registered users)
    const { data: existingProfileByEmail, error: profileEmailError } = await adminClient
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (profileEmailError) {
      console.error("Error checking profile by email:", profileEmailError);
      return new Response(JSON.stringify({ error: "Failed to check existing users" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (existingProfileByEmail) {
      return new Response(JSON.stringify({ error: "A user with this email already exists" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if invite already exists (use maybeSingle to avoid error when no row exists)
    const { data: existingInvite } = await adminClient
      .from("supporter_invites")
      .select("id")
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (existingInvite) {
      return new Response(JSON.stringify({ error: "An invite for this email already exists" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If this is a sub-agent being created by an agent, store the parent agent ID
    let parentAgentId: string | null = null;
    if (creatorRole === 'agent' && role === 'agent') {
      parentAgentId = user.id;
      console.log(`Creating sub-agent invite for ${email} with parent agent ${user.id}`);
    }

    // Create the invite record with parent_agent_id if applicable
    const { data: invite, error: inviteError } = await adminClient
      .from("supporter_invites")
      .insert({
        email,
        full_name: fullName,
        phone,
        temp_password: password,
        role,
        created_by: user.id,
        parent_agent_id: parentAgentId,
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

    console.log(`Created ${role} invite for ${email} by ${creatorRole} ${user.id}${parentAgentId ? ' (sub-agent)' : ''}`);
    // subAgentParentId variable removed - now using parentAgentId from invite creation above

    return new Response(JSON.stringify({ 
      success: true, 
      invite: {
        id: invite.id,
        activation_token: invite.activation_token,
        email: invite.email,
        full_name: invite.full_name,
        role: invite.role,
        parent_agent_id: parentAgentId,
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
