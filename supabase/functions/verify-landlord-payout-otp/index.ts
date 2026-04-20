// Verify OTP for agent-initiated landlord payout, then trigger disbursement.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Missing authorization" }, 401);
    const { data: u, error: uErr } = await admin.auth.getUser(auth.replace("Bearer ", ""));
    if (uErr || !u?.user) return json({ error: "Invalid token" }, 401);
    const agentId = u.user.id;

    const { challenge_id, otp } = (await req.json().catch(() => ({}))) ?? {};
    if (!challenge_id || !otp || !/^\d{6}$/.test(String(otp))) {
      return json({ error: "Invalid request" }, 400);
    }

    const { data: ch, error: chErr } = await admin
      .from("landlord_payout_otp_challenges")
      .select("*")
      .eq("id", challenge_id)
      .eq("agent_id", agentId)
      .maybeSingle();
    if (chErr || !ch) return json({ error: "Challenge not found" }, 404);

    if (ch.status !== "pending") return json({ error: `Challenge already ${ch.status}` }, 400);
    if (new Date(ch.otp_expires_at).getTime() < Date.now()) {
      await admin.from("landlord_payout_otp_challenges").update({ status: "expired" }).eq("id", challenge_id);
      return json({ error: "OTP expired. Request a new code." }, 400);
    }
    if (ch.attempts >= ch.max_attempts) {
      await admin.from("landlord_payout_otp_challenges").update({ status: "failed" }).eq("id", challenge_id);
      return json({ error: "Too many attempts. Start over." }, 400);
    }

    const submitted_hash = await sha256(String(otp));
    if (submitted_hash !== ch.otp_hash) {
      const newAttempts = ch.attempts + 1;
      const exhausted = newAttempts >= ch.max_attempts;
      await admin
        .from("landlord_payout_otp_challenges")
        .update({ attempts: newAttempts, status: exhausted ? "failed" : "pending" })
        .eq("id", challenge_id);
      return json(
        { error: exhausted ? "Too many incorrect attempts." : "Incorrect OTP", attempts_left: ch.max_attempts - newAttempts },
        400,
      );
    }

    // Mark verified
    const verified_at = new Date().toISOString();
    await admin
      .from("landlord_payout_otp_challenges")
      .update({ status: "verified", verified_at })
      .eq("id", challenge_id);

    // Trigger disbursement (passes agent's own JWT so the existing function attributes correctly)
    const disburseRes = await fetch(`${SUPABASE_URL}/functions/v1/landlord-payout-disburse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify({
        rent_request_id: ch.rent_request_id ?? challenge_id, // fallback for ad-hoc payouts
        landlord_id: ch.landlord_id,
        tenant_id: ch.tenant_id,
        amount: ch.amount,
        landlord_phone: ch.landlord_phone,
        landlord_name: ch.landlord_name,
        mobile_money_provider: ch.mobile_money_provider,
        otp_verified_at: verified_at,
        agent_latitude: ch.agent_latitude,
        agent_longitude: ch.agent_longitude,
        property_latitude: ch.property_latitude,
        property_longitude: ch.property_longitude,
      }),
    });

    const disburseBody = await disburseRes.json().catch(() => ({}));
    if (!disburseRes.ok) {
      return json(
        { error: disburseBody?.error ?? "Disbursement failed to start", challenge_id },
        disburseRes.status,
      );
    }

    // Link resulting payout back to challenge
    if (disburseBody?.payout_id) {
      await admin
        .from("landlord_payout_otp_challenges")
        .update({ resulting_payout_id: disburseBody.payout_id })
        .eq("id", challenge_id);
    }

    return json({
      success: true,
      challenge_id,
      payout_id: disburseBody?.payout_id ?? null,
      verified_at,
    });
  } catch (e) {
    console.error("[verify-landlord-payout-otp] error", e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});