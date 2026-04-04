import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("256") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+256${digits.slice(1)}`;
  if (digits.length === 9) return `+256${digits}`;
  return `+${digits}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { full_name, phone, agent_id, notes } = await req.json();

    if (!full_name || !phone || !agent_id) {
      return new Response(
        JSON.stringify({ error: "full_name, phone, and agent_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (full_name.length < 2 || full_name.length > 100) {
      return new Response(
        JSON.stringify({ error: "Name must be 2-100 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedPhone = normalizePhone(phone);
    const local9 = normalizedPhone.slice(-9);

    // Check if phone already exists
    const phoneFormats = [local9, `0${local9}`, `256${local9}`, `+256${local9}`];
    const { data: existing } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("phone", phoneFormats)
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(
        JSON.stringify({ error: `Phone already registered to ${existing[0].full_name || "another user"}` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create auth user (no password — USSD-only user)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      phone: normalizedPhone,
      phone_confirm: true,
      user_metadata: { full_name, registered_by_agent: agent_id },
    });

    if (authError) {
      return new Response(
        JSON.stringify({ error: `Auth error: ${authError.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authData.user.id;

    // Insert profile
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: userId,
      full_name: full_name.trim(),
      phone: normalizedPhone,
      registration_method: "proxy_agent",
    });

    if (profileError) {
      console.error("Profile insert error:", profileError);
    }

    // Insert supporter role
    const { error: roleError } = await supabase.from("user_roles").insert({
      user_id: userId,
      role: "supporter",
    });

    if (roleError) {
      console.error("Role insert error:", roleError);
    }

    // Create wallet
    const { error: walletError } = await supabase.from("wallets").insert({
      user_id: userId,
      balance: 0,
    });

    if (walletError) {
      console.error("Wallet insert error:", walletError);
    }

    // Create proxy assignment (pending approval)
    const { error: proxyError } = await supabase.from("proxy_agent_assignments").insert({
      agent_id,
      beneficiary_id: userId,
      beneficiary_role: "supporter",
      assigned_by: agent_id,
      reason: notes || "No-smartphone funder registered by agent",
      is_active: false,
      approval_status: "pending",
    });

    if (proxyError) {
      console.error("Proxy assignment error:", proxyError);
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: agent_id,
      action: "register_proxy_funder",
      details: `Registered no-smartphone funder: ${full_name} (${normalizedPhone})`,
      target_user_id: userId,
      is_proxy: true,
      audit_reason: `Agent proxy registration for funder without smartphone: ${full_name}`,
    });

    return new Response(
      JSON.stringify({ success: true, funder_id: userId, full_name, phone: normalizedPhone }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("register-proxy-funder error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
