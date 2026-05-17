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

async function sendEmail(
  to: string,
  subject: string,
  title: string,
  body: string,
  trackUrl: string,
): Promise<{ ok: boolean; status: number; raw?: string }> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const gmailKey = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!lovableKey || !gmailKey) {
    console.warn("[notify-business-advance-status] Gmail connector creds missing — skipping email");
    return { ok: false, status: 0 };
  }

  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#ffffff;padding:24px;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
    <div style="background:#0f172a;color:#fff;padding:18px 22px;font-weight:600;font-size:14px;letter-spacing:.3px">WELILE · Business Advance</div>
    <div style="padding:22px">
      <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a">${title}</h1>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#334155">${body}</p>
      <a href="${trackUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;font-size:14px">Track live status</a>
      <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">You can also reply to this email if you have questions.</p>
    </div>
  </div></body></html>`;

  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    html,
  ].join('\r\n');
  const b64 = btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await fetch(
    "https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmailKey,
      },
      body: JSON.stringify({ raw: b64 }),
    },
  );
  const text = await res.text();
  return { ok: res.ok, status: res.status, raw: text };
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
      .select("phone, full_name, email")
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

    // 4) Email (best-effort via Gmail connector)
    let emailResult: { ok: boolean; status: number; raw?: string } | null = null;
    const emailAddr = (tenant as any)?.email as string | undefined;
    const NOTIFY_STAGES: Status[] = [
      "pending",
      "agent_ops_approved",
      "tenant_ops_approved",
      "landlord_ops_approved",
      "coo_approved",
      "active",
      "rejected",
      "completed",
    ];
    if (emailAddr && /.+@.+\..+/.test(emailAddr) && NOTIFY_STAGES.includes(new_status)) {
      try {
        emailResult = await sendEmail(emailAddr, copy.title, copy.title, copy.body, trackUrl);
        console.log("[notify-business-advance-status] Email result", emailResult?.status);
      } catch (e) {
        console.warn("[notify-business-advance-status] email failed:", (e as Error)?.message);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, notified: !!tenant?.phone, sms: smsResult, email: emailResult }),
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