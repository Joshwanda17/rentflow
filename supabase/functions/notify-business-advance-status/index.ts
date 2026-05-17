import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PUBLIC_TRACK_BASE = "https://welilereceipts.com/business-advance/track";

type Status =
  | "pending"
  | "agent_ops_approved"
  | "tenant_ops_approved"
  | "landlord_ops_approved"
  | "coo_approved"
  | "active"
  | "rejected"
  | "completed";

function copyForStatus(status: Status, businessName: string, principalUgx: number, rejectionReason?: string | null) {
  const amt = `UGX ${Math.round(principalUgx).toLocaleString()}`;
  switch (status) {
    case "pending":
      return {
        title: "Business Advance submitted",
        body: `Your request for ${amt} (${businessName}) is now in review. We'll keep you posted at every stage.`,
      };
    case "agent_ops_approved":
      return { title: "Agent Ops approved ✓", body: `Step 1 of 5 done. ${businessName}: Tenant Ops is reviewing your file next.` };
    case "tenant_ops_approved":
      return { title: "Tenant Ops approved ✓", body: `Step 2 of 5 done. Landlord Ops is verifying your location next.` };
    case "landlord_ops_approved":
      return { title: "Landlord Ops approved ✓", body: `Step 3 of 5 done. Awaiting COO sign-off — almost there!` };
    case "coo_approved":
      return { title: "COO approved ✓", body: `Step 4 of 5 done. CFO will disburse ${amt} shortly.` };
    case "active":
      return { title: "🎉 Business Advance disbursed", body: `${amt} has been credited. Track repayments any time in your dashboard.` };
    case "rejected":
      return {
        title: "Business Advance not approved",
        body: rejectionReason?.trim()
          ? `Reason: ${rejectionReason.trim()}. Talk to your agent if you'd like to try again.`
          : `We couldn't approve this request right now. Your agent can help you re-apply.`,
      };
    case "completed":
      return { title: "Business Advance fully repaid 🎉", body: `Congrats — you're paid in full. You've just unlocked a higher limit.` };
  }
}

function formatPhone(phone: string): string {
  const d = phone.replace(/[^0-9]/g, "");
  if (d.startsWith("256")) return `+${d}`;
  if (d.startsWith("0")) return `+256${d.slice(1)}`;
  if (d.length === 9) return `+256${d}`;
  return `+${d}`;
}

async function sendSMS(phone: string, message: string): Promise<{ ok: boolean; status: number; raw?: string }> {
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  const username = Deno.env.get("AFRICASTALKING_USERNAME");
  if (!apiKey || !username) {
    console.warn("[notify-business-advance-status] AT credentials missing — skipping SMS");
    return { ok: false, status: 0 };
  }
  const isSandbox = username.toLowerCase() === "sandbox";
  const baseUrl = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
  const body = new URLSearchParams({ username, to: formatPhone(phone), message, from: "WELILE" });
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", apiKey, Accept: "application/json" },
    body: body.toString(),
  });
  const raw = await res.text();
  return { ok: res.ok, status: res.status, raw };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const advance_id: string | undefined = body?.advance_id;
    const new_status: Status | undefined = body?.new_status;
    if (!advance_id || !new_status) {
      return new Response(JSON.stringify({ error: "advance_id and new_status are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load advance + tenant profile
    const { data: adv, error: advErr } = await admin
      .from("business_advances")
      .select("id, tenant_id, business_name, principal, rejection_reason, status")
      .eq("id", advance_id)
      .maybeSingle();
    if (advErr || !adv) {
      console.error("[notify-business-advance-status] Advance not found", advErr);
      return new Response(JSON.stringify({ error: "Advance not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenant } = await admin
      .from("profiles")
      .select("phone, full_name")
      .eq("id", adv.tenant_id)
      .maybeSingle();

    const copy = copyForStatus(new_status, adv.business_name, Number(adv.principal), adv.rejection_reason);
    const trackUrl = tenant?.phone ? `${PUBLIC_TRACK_BASE}?phone=${encodeURIComponent(tenant.phone)}` : PUBLIC_TRACK_BASE;

    // 1) In-app event (drives realtime tracker + activity feed)
    await admin.from("system_events").insert({
      event_type: "business_advance.status_changed",
      user_id: adv.tenant_id,
      related_entity_type: "business_advances",
      related_entity_id: adv.id,
      metadata: {
        new_status,
        title: copy.title,
        body: copy.body,
        business_name: adv.business_name,
        principal: Number(adv.principal),
        track_url: trackUrl,
      },
    });

    // 2) Push notification (best-effort)
    try {
      await admin.functions.invoke("send-push-notification", {
        body: {
          userIds: [adv.tenant_id],
          payload: {
            title: copy.title,
            body: copy.body,
            url: "/dashboard/tenant",
            type: "business_advance_status",
          },
        },
      });
    } catch (e) {
      console.warn("[notify-business-advance-status] push failed:", (e as Error)?.message);
    }

    // 3) SMS / WhatsApp-openable text fallback
    let smsResult: { ok: boolean; status: number; raw?: string } | null = null;
    if (tenant?.phone) {
      const text = `${copy.title}\n${copy.body}\nTrack: ${trackUrl}`;
      smsResult = await sendSMS(tenant.phone, text);
      console.log("[notify-business-advance-status] SMS result", smsResult);
    }

    return new Response(
      JSON.stringify({ ok: true, notified: !!tenant?.phone, sms: smsResult }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[notify-business-advance-status] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error)?.message ?? "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});