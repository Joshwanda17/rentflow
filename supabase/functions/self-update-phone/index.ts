import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Strict canonical normalization — mirrors public.normalize_e164_phone in the DB.
 * Returns a valid E.164 string, or null when the input cannot be coerced to a
 * valid number (e.g. malformed 11-digit local entries like "07827277378").
 */
function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const hadPlus = s.startsWith("+");
  const d = s.replace(/\D/g, "");
  if (!d) return null;

  // Ugandan local form: leading 0, no country code (e.g. 0771234567)
  if (!hadPlus && d.startsWith("0")) {
    const national = d.slice(1).replace(/^0+/, "");
    return national.length === 9 ? `+256${national}` : null;
  }
  // Uganda country code, with or without + (e.g. 256771234567)
  if (d.startsWith("256")) {
    const national = d.slice(3).replace(/^0+/, "");
    return national.length === 9 ? `+256${national}` : null;
  }
  // Bare 9-digit Ugandan number without any prefix (e.g. 771234567)
  if (!hadPlus && d.length === 9) return `+256${d}`;
  // Explicit international number: + followed by 9-15 digits
  if (hadPlus && d.length >= 9 && d.length <= 15) return `+${d}`;
  return null;
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
    // Reject anything that can't be coerced to a valid canonical number.
    if (!normalized || !/^\+\d{9,15}$/.test(normalized)) {
      return json({ error: "Please enter a valid phone number" }, 400);
    }
    const authPhone = normalized.replace(/^\+/, "");

    // Require recent OTP verification for the new phone (last 10 minutes).
    // The sms-otp function stores rows keyed by the last 9 digits of the phone.
    const last9 = authPhone.slice(-9);
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: otpRow } = await adminClient
      .from("otp_verifications")
      .select("verified, verified_at")
      .eq("phone", last9)
      .eq("verified", true)
      .gte("verified_at", tenMinAgo)
      .order("verified_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!otpRow) {
      return json({ error: "Please verify this phone number with an SMS code before saving." }, 403);
    }

    // Duplicate handling — the caller has proven ownership of this SIM via a
    // recent OTP, so any OTHER account still holding this number is revoked
    // (its phone is cleared) before we assign the number to the caller.
    // IMPORTANT: a stale holder can exist at the login (auth) level even when
    // its visible profile phone is a completely different number. Checking only
    // profiles.phone missed those and the auth update failed with
    // "phone number already registered". We now union both sources.
    const { data: dupProfiles } = await adminClient
      .from("profiles")
      .select("id")
      .or(`phone.eq.${normalized},phone.eq.${authPhone}`)
      .neq("id", caller.id);

    const { data: dupAuthRows, error: dupAuthErr } = await adminClient.rpc(
      "auth_user_ids_by_phone_last9",
      { p_last9: last9 },
    );
    if (dupAuthErr) {
      console.error("auth phone duplicate lookup failed:", dupAuthErr);
    }

    const dupIds = new Set<string>();
    for (const p of dupProfiles ?? []) dupIds.add(p.id as string);
    for (const a of (dupAuthRows ?? []) as { user_id: string }[]) {
      if (a.user_id && a.user_id !== caller.id) dupIds.add(a.user_id);
    }
    dupIds.delete(caller.id);

    const revokedFrom: string[] = [];
    for (const dup of [...dupIds].map((id) => ({ id }))) {
      // Clear the phone on the previous owner's auth account so the unique
      // auth.users phone constraint doesn't block the caller's update.
      const { error: revokeAuthErr } = await adminClient.auth.admin.updateUserById(dup.id, {
        phone: "",
      });
      if (revokeAuthErr) {
        console.error("failed to revoke auth phone for", dup.id, revokeAuthErr);
      }
      // Clear the mirrored profile phone.
      await adminClient.from("profiles").update({ phone: null }).eq("id", dup.id);
      // Audit the revocation against the previous owner.
      await adminClient.from("audit_logs").insert({
        actor_id: caller.id,
        action_type: "user_phone_revoked",
        table_name: "profiles",
        record_id: dup.id,
        reason: "reassigned_after_otp",
        details: { revoked_phone: normalized, reassigned_to: caller.id },
      });
      revokedFrom.push(dup.id);
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
      details: { phone: normalized, revoked_from: revokedFrom },
    });

    return json({ success: true, phone: normalized, revoked_from: revokedFrom });
  } catch (error: any) {
    console.error("self-update-phone error:", error);
    return json({ error: error?.message || "Failed to update phone" }, 400);
  }
});