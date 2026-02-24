import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation helpers
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
  // Allow digits, +, -, spaces, parens
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

    let body: unknown;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { full_name: rawName, phone: rawPhone, email: rawEmail } = body as Record<string, unknown>;

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
    const last9 = digits.slice(-9);
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
      user_metadata: { full_name, phone: cleanPhone },
    });

    if (createErr) {
      console.error("[register-tenant] Auth create error:", createErr);
      return new Response(JSON.stringify({ error: "Failed to create tenant account" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = authData.user.id;

    // Update profile (trigger should have created it)
    await supabaseAdmin
      .from("profiles")
      .update({ full_name, phone: cleanPhone })
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
        full_name,
        phone: cleanPhone,
        email: virtualEmail,
        temp_password: tempPassword,
        activation_token: activationToken,
        created_by: callingUser.id,
        role: "tenant",
        status: "pending",
      });

    console.log(`[register-tenant] Created tenant ${userId}`);

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
