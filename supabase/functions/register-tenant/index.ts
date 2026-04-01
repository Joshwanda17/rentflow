import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function validateFullName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (cleaned.length < 2 || cleaned.length > 100) return null;
  if (!/^[\p{L}\p{M}\s'.-]+$/u.test(cleaned)) return null;
  return cleaned;
}

function validatePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (cleaned.length < 7 || cleaned.length > 20) return null;
  if (!/^[0-9+\-\s()]+$/.test(cleaned)) return null;
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) return null;
  return cleaned;
}

function validateEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase();
  if (cleaned.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return null;
  return cleaned;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[register-tenant] Function invoked");

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the calling user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log("[register-tenant] No auth header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user: callingUser }, error: authErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !callingUser) {
      console.log("[register-tenant] Auth failed:", authErr?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: unknown;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { full_name: rawName, phone: rawPhone, email: rawEmail } = body as Record<string, unknown>;
    console.log("[register-tenant] Input:", { rawName, rawPhone });

    const full_name = validateFullName(rawName);
    const phone = validatePhone(rawPhone);

    if (!full_name) {
      return new Response(JSON.stringify({ error: "Invalid name. Must be 2-100 characters, letters only." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!phone) {
      return new Response(JSON.stringify({ error: "Invalid phone number format." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanPhone = phone.trim();
    const digits = cleanPhone.replace(/[^0-9]/g, '');
    const virtualEmail = (rawEmail ? validateEmail(rawEmail) : null) || `${digits}@noapp.welile.user`;

    // Check if a profile with this phone already exists (exact match)
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", cleanPhone)
      .maybeSingle();

    if (existing) {
      console.log("[register-tenant] Found existing profile by exact phone:", existing.id);
      return new Response(JSON.stringify({ user_id: existing.id, existing: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Also check by normalized last 9 digits
    const last9 = digits.slice(-9);
    const { data: existingByLast9 } = await supabaseAdmin
      .from("profiles")
      .select("id, phone")
      .ilike("phone", `%${last9}`);

    if (existingByLast9 && existingByLast9.length > 0) {
      console.log("[register-tenant] Found existing profile by last9:", existingByLast9[0].id);
      return new Response(JSON.stringify({ user_id: existingByLast9[0].id, existing: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if auth user with this email already exists
    const { data: existingAuthUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuth = existingAuthUsers?.users?.find(u => u.email === virtualEmail);
    if (existingAuth) {
      console.log("[register-tenant] Auth user exists with email, reusing:", existingAuth.id);
      // Ensure profile exists
      await supabaseAdmin.from("profiles").upsert({
        id: existingAuth.id,
        full_name,
        phone: cleanPhone,
        email: virtualEmail,
      }, { onConflict: "id" });
      return new Response(JSON.stringify({ user_id: existingAuth.id, existing: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create auth user with a temp password
    const tempPassword = crypto.randomUUID().slice(0, 12) + "Aa1!";

    console.log("[register-tenant] Creating auth user with email:", virtualEmail);
    const { data: authData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: virtualEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name, phone: cleanPhone },
    });

    if (createErr) {
      console.error("[register-tenant] Auth create error:", createErr.message);
      return new Response(JSON.stringify({ error: `Failed to create tenant account: ${createErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = authData.user.id;
    console.log("[register-tenant] Created auth user:", userId);

    // Update profile (trigger should have created it)
    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .update({ full_name, phone: cleanPhone })
      .eq("id", userId);
    
    if (profileErr) {
      console.error("[register-tenant] Profile update error:", profileErr.message);
    }

    // Assign tenant role
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "tenant", enabled: true }, { onConflict: "user_id,role" });
    
    if (roleErr) {
      console.error("[register-tenant] Role upsert error:", roleErr.message);
    }

    // Create referral link between agent and tenant
    await supabaseAdmin
      .from("referrals")
      .upsert({ referrer_id: callingUser.id, referred_id: userId }, { onConflict: "referrer_id,referred_id" })
      .then(({ error }) => {
        if (error) console.log("[register-tenant] Referral upsert (non-critical):", error.message);
      });

    // Create activation invite so the tenant can claim their account later
    const activationToken = crypto.randomUUID();
    const { error: inviteErr } = await supabaseAdmin
      .from("supporter_invites")
      .insert({
        full_name,
        phone: cleanPhone,
        email: virtualEmail,
        temp_password: tempPassword,
        activation_token: activationToken,
        created_by: callingUser.id,
        role: "tenant",
        status: "pending",
      });

    if (inviteErr) {
      console.error("[register-tenant] Invite insert error:", inviteErr.message);
      // Non-critical: tenant was created, invite is just for claiming
    }

    console.log(`[register-tenant] Successfully created tenant ${userId}`);


    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ title: "👤 Tenant Registered", body: "Activity: new tenant", url: "/manager" }),
    }).catch(() => {});


    return new Response(JSON.stringify({
      user_id: userId,
      existing: false,
      activation_token: activationToken,
      temp_password: tempPassword,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[register-tenant] Unhandled error:", error?.message || error);
    return new Response(JSON.stringify({ error: `Service error: ${error?.message || 'Unknown'}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
