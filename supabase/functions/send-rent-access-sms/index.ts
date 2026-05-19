// Sends a short SMS to a tenant pointing at their branded Welile
// "Rent Money You Can Get" card. SMS cannot carry the image inline,
// so we deliver a short link to the public limit page which renders
// the same fully-branded card the agent saw.
//
// Two invocation modes:
//  - manual:    agent taps "Share via SMS" in the share dialog
//  - allocation: fired automatically after a successful agent allocation

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function formatPhoneInternational(phone: string): string {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.startsWith("256")) return `+${digits}`;
  if (digits.startsWith("0")) return `+256${digits.slice(1)}`;
  if (digits.length === 9) return `+256${digits}`;
  return `+${digits}`;
}

function formatUGX(n: number): string {
  const v = Math.max(0, Math.round(Number(n) || 0));
  return `UGX ${v.toLocaleString("en-UG")}`;
}

async function sendSMS(phone: string, message: string): Promise<boolean> {
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  const username = Deno.env.get("AFRICASTALKING_USERNAME");
  if (!apiKey || !username) {
    console.error("[send-rent-access-sms] Missing AT credentials");
    return false;
  }
  const isSandbox = username.toLowerCase() === "sandbox";
  const baseUrl = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";

  const to = formatPhoneInternational(phone);
  if (!to) return false;

  try {
    const body = new URLSearchParams({
      username,
      to,
      message,
      from: "WELILE",
    });
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey,
        Accept: "application/json",
      },
      body: body.toString(),
    });
    const raw = await res.text();
    let data: any;
    try { data = JSON.parse(raw); } catch {
      console.error("[send-rent-access-sms] Non-JSON AT response:", raw);
      return false;
    }
    const recipients = data?.SMSMessageData?.Recipients || [];
    const ok = recipients.some(
      (r: any) => r.statusCode === 100 || r.statusCode === 101,
    );
    console.log(
      `[send-rent-access-sms] to=${to} ok=${ok} status=${res.status} recipients=${JSON.stringify(recipients)}`,
    );
    return ok;
  } catch (err) {
    console.error("[send-rent-access-sms] send failed:", err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const adminClient = createClient(
      url,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userResp, error: userErr } =
      await adminClient.auth.getUser(token);
    if (userErr || !userResp?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const {
      tenant_id,
      tenant_name,
      tenant_phone,
      share_url,
      limit_amount,
      allocation_amount,
      mode, // 'manual' | 'allocation'
    } = body || {};

    if (!tenant_phone || !tenant_name) {
      return new Response(
        JSON.stringify({ error: "tenant_phone and tenant_name are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const firstName = String(tenant_name).split(" ")[0];
    const limitText =
      Number(limit_amount) > 0 ? formatUGX(Number(limit_amount)) : null;
    const allocText =
      Number(allocation_amount) > 0
        ? formatUGX(Number(allocation_amount))
        : null;

    // SMS body — kept under 320 chars to fit 2 segments.
    const lines: string[] = ["WELILE — Rent Money You Can Get"];
    if (mode === "allocation" && allocText) {
      lines.push(`Hi ${firstName}, we just paid ${allocText} toward your rent.`);
    } else {
      lines.push(`Hi ${firstName},`);
    }
    if (limitText) {
      lines.push(`You can get up to ${limitText} for rent today.`);
    } else {
      lines.push("See how much rent money you can get today.");
    }
    if (share_url) lines.push(`View your card: ${share_url}`);
    lines.push("Pay on time — your limit grows daily.");
    const message = lines.join("\n");

    const ok = await sendSMS(tenant_phone, message);

    // Best-effort: log the send as a system event for auditability.
    if (tenant_id) {
      try {
        await userClient.from("system_events").insert({
          event_type: "rent_access_limit.sms.sent",
          actor_id: userResp.user.id,
          subject_id: tenant_id,
          payload: {
            mode: mode || "manual",
            success: ok,
            limit_amount: Number(limit_amount) || null,
            allocation_amount: Number(allocation_amount) || null,
            share_url: share_url || null,
          },
        });
      } catch (e) {
        console.warn("[send-rent-access-sms] system_events insert failed", e);
      }
    }

    return new Response(JSON.stringify({ success: ok }), {
      status: ok ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[send-rent-access-sms] error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});