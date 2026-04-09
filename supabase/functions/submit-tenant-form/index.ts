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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[submit-tenant-form] Function invoked");

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { token, agent_id, full_name: rawName, phone: rawPhone, national_id, rent_amount, property_address } = body;

    // Validate required fields
    if (!token || typeof token !== 'string') {
      return new Response(JSON.stringify({ error: "Missing or invalid token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!agent_id || typeof agent_id !== 'string') {
      return new Response(JSON.stringify({ error: "Missing agent ID" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate token
    const { data: tokenData, error: tokenErr } = await supabaseAdmin
      .from("agent_form_tokens")
      .select("*")
      .eq("token", token)
      .eq("agent_id", agent_id)
      .eq("is_active", true)
      .maybeSingle();

    if (tokenErr || !tokenData) {
      console.log("[submit-tenant-form] Invalid token");
      return new Response(JSON.stringify({ error: "Invalid or expired link" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check expiry
    if (new Date(tokenData.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "This link has expired" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check usage limit
    if (tokenData.uses_count >= tokenData.max_uses) {
      return new Response(JSON.stringify({ error: "This link has reached its usage limit" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate form fields
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
    const virtualEmail = `${digits}@noapp.welile.user`;

    // Check if tenant already exists by phone
    const last9 = digits.slice(-9);
    const { data: existingByPhone } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("phone", `%${last9}`);

    let userId: string;
    let isExisting = false;

    if (existingByPhone && existingByPhone.length > 0) {
      userId = existingByPhone[0].id;
      isExisting = true;
      console.log("[submit-tenant-form] Existing tenant found:", userId);
    } else {
      // Create auth user
      const tempPassword = crypto.randomUUID().slice(0, 12) + "Aa1!";
      const { data: authData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: virtualEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name, phone: cleanPhone },
      });

      if (createErr) {
        // May already exist by email
        const { data: existingAuthUsers } = await supabaseAdmin.auth.admin.listUsers();
        const existingAuth = existingAuthUsers?.users?.find(u => u.email === virtualEmail);
        if (existingAuth) {
          userId = existingAuth.id;
          isExisting = true;
        } else {
          console.error("[submit-tenant-form] Auth create error:", createErr.message);
          return new Response(JSON.stringify({ error: `Failed to create tenant: ${createErr.message}` }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        userId = authData.user.id;

        // Update profile
        await supabaseAdmin
          .from("profiles")
          .update({ full_name, phone: cleanPhone })
          .eq("id", userId);

        // Assign tenant role
        await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: userId, role: "tenant", enabled: true }, { onConflict: "user_id,role" });

        // Create referral link
        await supabaseAdmin
          .from("referrals")
          .upsert({ referrer_id: agent_id, referred_id: userId }, { onConflict: "referrer_id,referred_id" })
          .then(({ error }) => {
            if (error) console.log("[submit-tenant-form] Referral upsert (non-critical):", error.message);
          });

        // Create activation invite
        const activationToken = crypto.randomUUID();
        await supabaseAdmin
          .from("supporter_invites")
          .insert({
            full_name,
            phone: cleanPhone,
            email: virtualEmail,
            temp_password: tempPassword,
            activation_token: activationToken,
            created_by: agent_id,
            role: "tenant",
            status: "pending",
          });
      }
    }

    // Store additional form data as metadata in profiles if provided
    if (!isExisting) {
      const updates: Record<string, unknown> = {};
      if (national_id && typeof national_id === 'string') {
        updates.national_id = national_id.trim();
      }
      if (Object.keys(updates).length > 0) {
        await supabaseAdmin.from("profiles").update(updates).eq("id", userId!);
      }
    }

    // Increment token usage
    await supabaseAdmin
      .from("agent_form_tokens")
      .update({ uses_count: tokenData.uses_count + 1 })
      .eq("id", tokenData.id);

    console.log(`[submit-tenant-form] Success: tenant=${userId}, existing=${isExisting}`);

    return new Response(JSON.stringify({
      success: true,
      tenant_id: userId!,
      existing: isExisting,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[submit-tenant-form] Unhandled error:", error?.message || error);
    return new Response(JSON.stringify({ error: `Service error: ${error?.message || 'Unknown'}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
