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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the calling user is an agent
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user: callingUser }, error: authErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !callingUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { full_name, phone, email } = await req.json();

    if (!full_name || !phone) {
      return new Response(JSON.stringify({ error: "Name and phone are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanPhone = phone.trim();
    const virtualEmail = email || `${cleanPhone.replace(/[^0-9]/g, '')}@noapp.welile.user`;

    // Check if a profile with this phone already exists
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", cleanPhone)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ user_id: existing.id, existing: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Also check by normalized last 9 digits
    const last9 = cleanPhone.replace(/[^0-9]/g, '').slice(-9);
    const { data: existingByLast9 } = await supabaseAdmin
      .from("profiles")
      .select("id, phone")
      .ilike("phone", `%${last9}`);

    if (existingByLast9 && existingByLast9.length > 0) {
      return new Response(JSON.stringify({ user_id: existingByLast9[0].id, existing: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create auth user with a temp password
    const tempPassword = crypto.randomUUID().slice(0, 12) + "Aa1!";

    const { data: authData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: virtualEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: full_name.trim(), phone: cleanPhone },
    });

    if (createErr) {
      console.error("[register-tenant] Auth create error:", createErr);
      return new Response(JSON.stringify({ error: "Failed to create tenant account: " + createErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = authData.user.id;

    // Update profile (trigger should have created it)
    await supabaseAdmin
      .from("profiles")
      .update({ full_name: full_name.trim(), phone: cleanPhone })
      .eq("id", userId);

    // Assign tenant role
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "tenant" }, { onConflict: "user_id,role" });

    // Create activation invite so the tenant can claim their account later
    const activationToken = crypto.randomUUID();
    await supabaseAdmin
      .from("supporter_invites")
      .insert({
        full_name: full_name.trim(),
        phone: cleanPhone,
        email: virtualEmail,
        temp_password: tempPassword,
        activation_token: activationToken,
        created_by: callingUser.id,
        role: "tenant",
        status: "pending",
      });

    console.log(`[register-tenant] Created tenant ${userId} for phone ${cleanPhone}`);

    return new Response(JSON.stringify({
      user_id: userId,
      existing: false,
      activation_token: activationToken,
      temp_password: tempPassword,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[register-tenant] Error:", error);
    return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
