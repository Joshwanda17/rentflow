import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // ---- AuthN: caller must be logged in ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !caller) return json({ error: "Unauthorized" }, 401);

    // ---- AuthZ: manager role required ----
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "manager")
      .eq("enabled", true);
    if (!roles || roles.length === 0) {
      return json({ error: "Forbidden: Manager role required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const user_id = body?.user_id as string | undefined;
    const reasonRaw = (body?.reason ?? "").toString().trim();
    const overrideEmail = (body?.email ?? "").toString().trim() || undefined;
    const overridePhone = (body?.phone ?? "").toString().trim() || undefined;

    if (!user_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user_id)) {
      return json({ error: "Valid user_id is required" }, 400);
    }
    if (reasonRaw.length < 10) {
      return json({ error: "Reason must be at least 10 characters" }, 400);
    }

    // ---- Read profile to recover the original email/phone (auth.users values are scrambled) ----
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("id, full_name, email, phone, tenant_status")
      .eq("id", user_id)
      .maybeSingle();
    if (profileErr) return json({ error: profileErr.message }, 500);
    if (!profile) return json({ error: "Profile not found for that user_id" }, 404);

    const restoredName = (profile.full_name || "").replace(/^\[ARCHIVED\]\s*/i, "").trim() || "Restored User";
    const restoredEmail = overrideEmail || profile.email || undefined;
    const restoredPhone = overridePhone || profile.phone || undefined;

    if (!restoredEmail && !restoredPhone) {
      return json({
        error: "Cannot restore: profile has no original email or phone. Pass `email` or `phone` in the request body to set them.",
      }, 400);
    }

    // ---- 1. Clear auth.users.deleted_at + banned_until ----
    const { data: clearRes, error: clearErr } = await admin.rpc("admin_restore_auth_user", {
      p_user_id: user_id,
    });
    if (clearErr) return json({ error: `Clear deleted_at failed: ${clearErr.message}` }, 500);
    if (!(clearRes as any)?.ok) {
      return json({ error: `Restore failed: ${(clearRes as any)?.reason || "unknown"}` }, 500);
    }

    // ---- 2. Restore email + phone on auth.users via admin SDK ----
    const updates: Record<string, unknown> = {};
    if (restoredEmail) { updates.email = restoredEmail; updates.email_confirm = true; }
    if (restoredPhone) { updates.phone = restoredPhone; updates.phone_confirm = true; }

    const { error: updErr } = await admin.auth.admin.updateUserById(user_id, updates);
    if (updErr) {
      // Common cause: email/phone already taken by another live auth account.
      return json({
        error: `Auth identity restore failed: ${updErr.message}. The original email/phone may already belong to another account — pass a different \`email\` or \`phone\` in the request.`,
      }, 409);
    }

    // ---- 3. Un-archive the profile ----
    const { error: profUpdErr } = await admin
      .from("profiles")
      .update({
        full_name: restoredName,
        tenant_status: profile.tenant_status === "inactive" ? "active" : profile.tenant_status,
        email: restoredEmail ?? profile.email,
        phone: restoredPhone ?? profile.phone,
      })
      .eq("id", user_id);
    if (profUpdErr) {
      console.warn("Profile un-archive failed:", profUpdErr);
    }

    // ---- 4. Audit log ----
    await admin.from("audit_logs").insert({
      user_id: caller.id,
      action_type: "account_restored",
      table_name: "auth.users",
      record_id: user_id,
      metadata: {
        reason: reasonRaw,
        restored_name: restoredName,
        restored_email: restoredEmail,
        restored_phone: restoredPhone,
        previous_deleted_at: (clearRes as any)?.previous_deleted_at,
      },
    });

    return json({
      success: true,
      user_id,
      restored_name: restoredName,
      restored_email: restoredEmail,
      restored_phone: restoredPhone,
      previous_deleted_at: (clearRes as any)?.previous_deleted_at,
    });
  } catch (e) {
    console.error("restore-archived-account error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});