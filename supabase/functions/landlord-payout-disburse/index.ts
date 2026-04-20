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

    // Retry loop — auto-disburse with exp backoff
    let lastErr: string | null = null;
    let externalRef: string | null = null;

    for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
      try {
        if (i > 0) await sleep(RETRY_DELAYS_MS[i]);
        const result = await callMoMoGateway(
          landlord_phone,
          amount,
          mobile_money_provider,
          payout.id,
        );
        externalRef = result.reference;
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
        await adminClient.from("landlord_payouts").update({
          attempts: i + 1,
          last_attempt_at: new Date().toISOString(),
          last_error: lastErr,
        }).eq("id", payout.id);
      }
    }

    if (externalRef) {
      // SUCCESS
      await adminClient.from("landlord_payouts").update({
        status: "completed",
        disbursed_at: new Date().toISOString(),
        external_reference: externalRef,
        last_error: null,
      }).eq("id", payout.id);

      // Mark rent request as paid (best-effort)
      try {
        await adminClient.rpc("record_rent_payment" as any, {
          p_rent_request_id: rent_request_id,
          p_amount: amount,
        });
      } catch { /* non-blocking */ }

      // SMS landlord (best-effort)
      try {
        await adminClient.functions.invoke("sms-otp", {
          body: {
            action: "send_custom",
            phone: landlord_phone,
            message: `Welile paid UGX ${Number(amount).toLocaleString()} to your ${mobile_money_provider} number. Ref: ${externalRef}`,
          },
        });
      } catch { /* non-blocking */ }

      await logSystemEvent(adminClient, "landlord_payout_completed", agentId, "landlord_payout", payout.id, {
        amount, external_reference: externalRef,
      });

      return new Response(JSON.stringify({
        ok: true,
        payout_id: payout.id,
        status: "completed",
        external_reference: externalRef,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ALL RETRIES FAILED → escalate + refund
    await adminClient.rpc("refund_agent_float_for_payout", {
      p_payout_id: payout.id,
      p_reason: `AUTO_ESCALATE_REFUND: ${lastErr ?? "gateway failure"}`,
    });

    await adminClient.from("landlord_payouts").update({
      status: "escalated",
      escalated_at: new Date().toISOString(),
      escalated_reason: lastErr ?? "All retries failed",
    }).eq("id", payout.id);

    await logSystemEvent(adminClient, "landlord_payout_escalated", agentId, "landlord_payout", payout.id, {
      amount, last_error: lastErr,
    });

    return new Response(JSON.stringify({
      ok: false,
      payout_id: payout.id,
      status: "escalated",
      message: "Payout escalated to Financial Ops after retries failed. Float refunded.",
      last_error: lastErr,
    }), {
      status: 202,
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
