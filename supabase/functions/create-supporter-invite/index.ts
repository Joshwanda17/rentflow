import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const validRoles = ['tenant', 'agent', 'supporter', 'landlord', 'manager'];

// Normalize phone numbers for duplicate checks.
const toDigits = (value: string) => value.replace(/\D/g, "");
const ugLocal9 = (value: string) => {
  const digits = toDigits(value);
  if (!digits) return null;
  const last9 = digits.length >= 9 ? digits.slice(-9) : digits;
  return last9.length === 9 ? last9 : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const body = await req.json();
    console.log("Received request body:", JSON.stringify({ 
      email: body.email, 
      fullName: body.fullName, 
      phone: body.phone?.substring(0, 4) + '***', 
      role: body.role,
      isSubAgent: body.isSubAgent 
    }));
    
    const { 
      phone, 
      password, 
      role = 'tenant', 
      isSubAgent = false,
      latitude,
      longitude,
      locationAccuracy,
      propertyAddress,
    } = body;

    // fullName and email are now optional - agent can skip them
    // They'll be filled in by the user during activation
    let { email, fullName } = body;

    if (!phone || !password) {
      return new Response(JSON.stringify({ error: "Phone number and password are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!validRoles.includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (creatorRole === 'agent' && !['tenant', 'landlord', 'agent', 'supporter'].includes(role)) {
      return new Response(JSON.stringify({ error: "Agents can only create tenant, landlord, sub-agent, and supporter accounts" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Auto-generate email and fullName if not provided
    if (!email) {
      email = `${phone.replace(/\D/g, '')}@welile.user`;
    }
    if (!fullName) {
      fullName = `User ${phone.replace(/\D/g, '').slice(-4)}`;
    }

    // Check if profile already exists with this phone number
    const { data: allProfiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id, full_name, phone");

    if (profilesError) {
      return new Response(JSON.stringify({ error: "Failed to check existing users" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const existingProfileByPhone = allProfiles?.find(p => {
      const profileLocal9 = ugLocal9(p.phone || '');
      return profileLocal9 && profileLocal9 === local9;
    });

    if (existingProfileByPhone) {
      return new Response(JSON.stringify({ 
        error: `This phone number is already registered to ${existingProfileByPhone.full_name}. They can sign in directly.`,
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if email already exists
    const { data: existingProfileByEmail } = await adminClient
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (existingProfileByEmail) {
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
      .maybeSingle();

    if (existingInvite) {
      return new Response(JSON.stringify({ error: "An invite for this email already exists" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parentAgentId: string | null = null;
    if (creatorRole === 'agent' && role === 'agent') {
      parentAgentId = user.id;
    }

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
        latitude: role === 'landlord' && latitude ? latitude : null,
        longitude: role === 'landlord' && longitude ? longitude : null,
        location_accuracy: role === 'landlord' && locationAccuracy ? locationAccuracy : null,
        property_address: role === 'landlord' && propertyAddress ? propertyAddress : null,
      })
      .select()
      .single();

    if (inviteError) {
      console.error("Invite error:", inviteError);
      
      if (inviteError.code === '23505') {
        const isPhoneDuplicate = inviteError.message?.includes('phone') || 
                                  inviteError.message?.includes('idx_supporter_invites_phone_normalized');
        if (isPhoneDuplicate) {
          return new Response(JSON.stringify({ error: "A user or pending invite with this phone number already exists" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: "This invite already exists (duplicate detected)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "Failed to create invite", details: inviteError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Created ${role} invite for ${email} by ${creatorRole} ${user.id}${parentAgentId ? ' (sub-agent)' : ''}`);

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
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
