// Africa's Talking Delivery Report (DLR) callback.
// AT POSTs a delivery report per recipient once the carrier confirms the final
// handset status. We correlate it to the original SMS via the messageId we saved
// in sms_delivery_log.provider_message_id, then upgrade the row to "delivered"
// or downgrade it to "failed" and mirror the outcome onto the landlord OTP audit
// trail so agents see delivered vs failed per recipient.
//
// Configure this URL as the "Delivery Reports" callback in the Africa's Talking
// dashboard (Settings -> SMS -> Delivery Reports):
//   https://<project-ref>.supabase.co/functions/v1/sms-delivery-report
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// AT final delivery statuses. "Success" = delivered to handset. "Failed" and
// "Rejected" are terminal failures. "Sent"/"Submitted"/"Buffered" are still
// in-flight (intermediate) — we record them but keep awaiting the final report.
function mapStatus(raw: string): "delivered" | "failed" | "pending" {
  const s = (raw || "").trim().toLowerCase();
  if (s === "success" || s === "delivered") return "delivered";
  if (s === "failed" || s === "rejected") return "failed";
  return "pending";
}

async function parseBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) {
      const j = await req.json();
      return Object.fromEntries(
        Object.entries(j ?? {}).map(([k, v]) => [k, v == null ? "" : String(v)]),
      );
    }
    // x-www-form-urlencoded or multipart/form-data
    const form = await req.formData();
    const out: Record<string, string> = {};
    for (const [k, v] of form.entries()) out[k] = typeof v === "string" ? v : "";
    return out;
  } catch {
    // Fall back to raw query-string parsing of the body text.
    try {
      const text = await req.text();
      return Object.fromEntries(new URLSearchParams(text));
    } catch {
      return {};
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const params = await parseBody(req);
    // AT DLR fields: id (messageId), status, phoneNumber, networkCode,
    // failureReason, retryCount.
    const messageId = params.id || params.messageId || "";
    const rawStatus = params.status || "";
    const phoneNumber = params.phoneNumber || "";
    const failureReason = params.failureReason || "";
    const networkCode = params.networkCode || "";
    const retryCount = params.retryCount || "";

    if (!messageId) {
      console.warn("[sms-delivery-report] DLR missing message id", params);
      // Acknowledge anyway so AT does not retry indefinitely.
      return ack();
    }

    const status = mapStatus(rawStatus);
    console.log(
      `[sms-delivery-report] DLR id=${messageId} status=${rawStatus} -> ${status} phone=${phoneNumber} reason=${failureReason || "—"}`,
    );

    // Find the original SMS log row by provider message id.
    const { data: logRow } = await admin
      .from("sms_delivery_log")
      .select("id, provider_response, reference_id, source, error")
      .eq("provider_message_id", messageId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const dlr = {
      type: "delivery_report",
      message_id: messageId,
      status: rawStatus,
      phone_number: phoneNumber,
      network_code: networkCode || null,
      failure_reason: failureReason || null,
      retry_count: retryCount || null,
      received_at: new Date().toISOString(),
    };

    if (logRow) {
      // Merge the DLR into the stored provider response for full auditability.
      const prev = (logRow as any).provider_response;
      const mergedResponse = prev && typeof prev === "object"
        ? { ...prev, delivery_report: dlr }
        : { send_response: prev ?? null, delivery_report: dlr };

      const update: Record<string, unknown> = {
        provider_response: mergedResponse,
      };
      // Only move to a terminal state; never overwrite a final state with a
      // later intermediate one.
      if (status === "delivered") {
        update.status = "delivered";
        update.error = null;
      } else if (status === "failed") {
        update.status = "failed";
        update.error = failureReason || (logRow as any).error || "Delivery failed";
      }

      await admin.from("sms_delivery_log").update(update).eq("id", (logRow as any).id);

      // Mirror onto the landlord OTP audit trail when this SMS was an OTP.
      const challengeId = (logRow as any).reference_id as string | null;
      const source = (logRow as any).source as string | null;
      if (challengeId && source === "issue-landlord-payout-otp" && status !== "pending") {
        const { data: challenge } = await admin
          .from("landlord_payout_otp_challenges")
          .select("agent_id, landlord_id, landlord_phone, amount")
          .eq("id", challengeId)
          .maybeSingle();

        await admin.from("landlord_payout_otp_events").insert({
          challenge_id: challengeId,
          agent_id: (challenge as any)?.agent_id ?? null,
          landlord_id: (challenge as any)?.landlord_id ?? null,
          event_type: "delivery_report",
          landlord_phone: (challenge as any)?.landlord_phone ?? phoneNumber,
          amount: (challenge as any)?.amount ?? null,
          detail: status === "delivered"
            ? "SMS delivered to landlord handset"
            : `SMS delivery failed${failureReason ? `: ${failureReason}` : ""}`,
          failure_reason: status === "failed" ? (failureReason || "delivery_failed") : null,
          metadata: {
            delivery_status: status,
            sms_status: rawStatus,
            sms_message_id: messageId,
            failure_reason: failureReason || null,
            network_code: networkCode || null,
            retry_count: retryCount || null,
          },
        });
      }
    } else {
      console.warn(
        `[sms-delivery-report] No sms_delivery_log row for message id ${messageId} — DLR not correlated`,
      );
    }

    return ack();
  } catch (e) {
    console.error("[sms-delivery-report] error", e);
    // Still acknowledge to avoid AT retry storms; we have the logs above.
    return ack();
  }

  function ack() {
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});