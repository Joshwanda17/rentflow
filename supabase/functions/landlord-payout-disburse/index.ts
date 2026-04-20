// Landlord Payout Disbursement Engine — OTP-triggered, manual via Financial Ops.
// Phase 2: deduct float and route to Financial Ops queue. No MoMo gateway calls.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logSystemEvent } from "../_shared/eventLogger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const OTP_FRESHNESS_SECONDS = 120;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await adminClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const agentId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const {
      rent_request_id,
      landlord_id,
      tenant_id,
      amount,
      landlord_phone,
      landlord_name,
      mobile_money_provider,
      otp_verified_at,
      agent_latitude,
      agent_longitude,
      property_latitude,
      property_longitude,
      gps_distance_meters,
      gps_match,
    } = body ?? {};

    if (!rent_request_id || !landlord_id || !amount || !landlord_phone || !mobile_money_provider) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // OTP freshness check
    const otpTime = otp_verified_at ? new Date(otp_verified_at).getTime() : Date.now();
    const ageSeconds = (Date.now() - otpTime) / 1000;
    if (ageSeconds > OTP_FRESHNESS_SECONDS) {
      return new Response(
        JSON.stringify({ error: "OTP verification expired (older than 2 minutes). Re-verify." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Insert payout row (eligibility trigger validates cutoff/float/landlord)
    const { data: payout, error: insertErr } = await adminClient
      .from("landlord_payouts")
      .insert({
        agent_id: agentId,
        landlord_id,
        tenant_id: tenant_id ?? null,
        rent_request_id,
        amount,
        landlord_phone,
        landlord_name: landlord_name ?? "Landlord",
        mobile_money_provider,
        otp_verified_at: new Date(otpTime).toISOString(),
        status: "otp_verified",
        agent_latitude: agent_latitude ?? null,
        agent_longitude: agent_longitude ?? null,
        property_latitude: property_latitude ?? null,
        property_longitude: property_longitude ?? null,
        gps_match: gps_match ?? null,
        gps_distance_meters: gps_distance_meters ?? null,
      })
      .select()
      .single();

    if (insertErr || !payout) {
      console.error("[landlord-payout-disburse] insert failed:", insertErr);
      return new Response(
        JSON.stringify({ error: insertErr?.message ?? "Eligibility check failed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await logSystemEvent(
      adminClient,
      "landlord_payout_initiated",
      agentId,
      "landlord_payout",
      payout.id,
      { amount, landlord_id },
    );

    // Atomic float deduction
    const { error: deductErr } = await adminClient.rpc("deduct_agent_float_for_payout", {
      p_payout_id: payout.id,
    });
    if (deductErr) {
      await adminClient.from("landlord_payouts").update({
        status: "failed",
        last_error: `Deduct failed: ${deductErr.message}`,
      }).eq("id", payout.id);
      return new Response(
        JSON.stringify({ error: `Float deduction failed: ${deductErr.message}`, payout_id: payout.id }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Phase 2: route to Financial Ops queue (no MoMo gateway call here).
    await adminClient
      .from("landlord_payouts")
      .update({ status: "pending_finops_disbursement" })
      .eq("id", payout.id);

    await logSystemEvent(
      adminClient,
      "landlord_payout_pending_finops",
      agentId,
      "landlord_payout",
      payout.id,
      { amount, landlord_id, landlord_phone, mobile_money_provider },
    );

    // Notify agent that the request is now with Financial Ops (best-effort)
    try {
      await adminClient.from("notifications").insert({
        user_id: agentId,
        type: "landlord_payout_pending_finops",
        title: "Sent to Financial Ops",
        message: `Your landlord payout of UGX ${Number(amount).toLocaleString()} for ${landlord_name ?? "landlord"} was sent to Financial Ops for disbursement.`,
        metadata: { payout_id: payout.id, amount },
      });
    } catch { /* non-blocking */ }

    return new Response(JSON.stringify({
      ok: true,
      payout_id: payout.id,
      status: "pending_finops_disbursement",
      message: "Sent to Financial Ops for disbursement. You'll be notified when the landlord is paid.",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[landlord-payout-disburse] fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
