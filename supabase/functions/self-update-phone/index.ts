import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(raw: string): string {
  const trimmed = raw.trim().replace(/[\s-]/g, "");
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed.startsWith("0")) return "+256" + trimmed.slice(1);
  if (/^\d{9,15}$/.test(trimmed)) return "+" + trimmed;
  return trimmed;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    if (!token) return json({ error: "Unauthorized" }, 401);
    const { data: authData, error: authErr } = await adminClient.auth.getUser(token);
    const caller = authData?.user;
    if (authErr || !caller) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const rawPhone = typeof body?.phone === "string" ? body.phone : "";
    if (!rawPhone.trim()) return json({ error: "Phone number is required" }, 400);

    const normalized = normalizePhone(rawPhone);
    // Basic E.164 sanity: + followed by 9-15 digits
    if (!/^\+\d{9,15}$/.test(normalized)) {
      return json({ error: "Please enter a valid phone number" }, 400);
    }
    const authPhone = normalized.replace(/^\+/, "");

    // Duplicate check (other users)
    const { data: dup } = await adminClient
      .from("profiles")
      .select("id")
      .or(`phone.eq.${normalized},phone.eq.${authPhone}`)
      .neq("id", caller.id)
      .limit(1);
    if (dup && dup.length > 0) {
      return json({ error: "This phone number is already used by another account" }, 409);
    }

    // Update auth.users
    const { error: updErr } = await adminClient.auth.admin.updateUserById(caller.id, {
      phone: authPhone,
      phone_confirm: true,
    });
    if (updErr) throw updErr;

    // Mirror to profiles
    const { error: profErr } = await adminClient
      .from("profiles")
      .update({ phone: normalized })
      .eq("id", caller.id);
    if (profErr) throw profErr;

    // Audit
    await adminClient.from("audit_logs").insert({
      actor_id: caller.id,
      action_type: "user_phone_self_update",
      table_name: "auth.users",
      record_id: caller.id,
      reason: "settings_self_service",
      details: { phone: normalized },
    });

    return json({ success: true, phone: normalized });
  } catch (error: any) {
    console.error("self-update-phone error:", error);
    return json({ error: error?.message || "Failed to update phone" }, 400);
  }
});