import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function formatPhoneInternational(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("0")) cleaned = "256" + cleaned.substring(1);
  else if (cleaned.startsWith("256")) {
    /* keep */
  } else if (cleaned.length === 9) cleaned = "256" + cleaned;
  return "+" + cleaned;
}

async function sendSMS(phone: string, message: string) {
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  const username = Deno.env.get("AFRICASTALKING_USERNAME");
  if (!apiKey || !username) {
    return { ok: false, reason: "Missing Africa's Talking credentials" };
  }

  const isSandbox = username.toLowerCase() === "sandbox";
  const baseUrl = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";

  const formattedPhone = formatPhoneInternational(phone);
  const body = new URLSearchParams({
    username,
    to: formattedPhone,
    message,
  });

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  const rawText = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    /* keep raw */
  }

  const recipients = parsed?.SMSMessageData?.Recipients || [];
  const success = recipients.some(
    (r: any) => r.statusCode === 101 || r.statusCode === 100,
  );

  return {
    ok: success,
    httpStatus: res.status,
    formattedPhone,
    sandbox: isSandbox,
    recipients,
    raw: parsed ?? rawText,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let phone = "0777607640";
    let message =
      "[Welile Test] Background SMS API test successful. If you received this, the SMS pipeline is healthy. — Welile Ops";

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body?.phone) phone = String(body.phone);
      if (body?.message) message = String(body.message);
    }

    const startedAt = new Date().toISOString();
    const result = await sendSMS(phone, message);
    const finishedAt = new Date().toISOString();

    // Audit log so we have a trail
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(supabaseUrl, serviceKey);
      await admin.from("audit_logs").insert({
        action_type: "sms_api_diagnostic_test",
        table_name: "sms_test",
        metadata: {
          phone,
          message,
          started_at: startedAt,
          finished_at: finishedAt,
          ...result,
        },
      });
    } catch (logErr) {
      console.warn("[sms-test-send] audit log failed:", logErr);
    }

    return new Response(
      JSON.stringify({ phone, message, startedAt, finishedAt, ...result }),
      {
        status: result.ok ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[sms-test-send] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});