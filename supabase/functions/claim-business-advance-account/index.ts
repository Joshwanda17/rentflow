import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function cleanPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.replace(/\s/g, "");
  if (!/^0[3-9][0-9]{8}$/.test(v)) return null;
  return v;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const phone = cleanPhone(body?.phone);
    const password = typeof body?.password === "string" ? body.password : "";
    const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";

    if (!phone) {
      return new Response(JSON.stringify({ error: "Invalid Ugandan phone number" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (password.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Find profile by phone
    const { data: profile } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("phone", phone)
      .maybeSingle();

    // 2. Require an existing business advance for this phone (proves the agent
    //    legitimately requested onboarding for them — no random self-claims).
    if (profile?.id) {
      const { count } = await admin
        .from("business_advances")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", profile.id);
      if (!count || count === 0) {
        return new Response(JSON.stringify({ error: "No Business Advance request found for this number" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "No Business Advance request found for this number" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const digits = phone.replace(/\D/g, "");
    const virtualEmail = profile.email || `${digits}@noapp.welile.user`;

    // 3. Locate auth user (by id we already have)
    const { data: authUser } = await admin.auth.admin.getUserById(profile.id);

    if (authUser?.user) {
      // Set the password the applicant chose + confirm email so they can sign in.
      const update: Record<string, unknown> = { password, email_confirm: true };
      if (fullName && !authUser.user.user_metadata?.full_name) {
        update.user_metadata = { ...(authUser.user.user_metadata || {}), full_name: fullName };
      }
      const { error: upErr } = await admin.auth.admin.updateUserById(profile.id, update);
      if (upErr) throw upErr;
    } else {
      // Defensive — profile exists but no auth user (shouldn't normally happen).
      const { error: cErr } = await admin.auth.admin.createUser({
        email: virtualEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName || profile.full_name || "", phone },
      });
      if (cErr) throw cErr;
    }

    // Keep profile full name in sync if applicant supplied one
    if (fullName) {
      await admin.from("profiles").update({ full_name: fullName }).eq("id", profile.id);
    }

    return new Response(JSON.stringify({ email: virtualEmail, user_id: profile.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[claim-business-advance-account]", e);
    return new Response(JSON.stringify({ error: (e as Error).message || "Server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
