import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function formatPhoneInternational(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("256")) return `+${digits}`;
  if (digits.startsWith("0")) return `+256${digits.slice(1)}`;
  if (digits.length === 9) return `+256${digits}`;
  return `+${digits}`;
}

async function sendSMS(phone: string, message: string): Promise<boolean> {
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  const username = Deno.env.get("AFRICASTALKING_USERNAME");
  if (!apiKey || !username) {
    console.error("[notify-standing-order-setup] Missing AT credentials");
    return false;
  }
  const isSandbox = username.toLowerCase() === "sandbox";
  const baseUrl = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
  try {
    const body = new URLSearchParams({
      username,
      to: formatPhoneInternational(phone),
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
    try { data = JSON.parse(raw); } catch { return false; }
    const recipients = data?.SMSMessageData?.Recipients || [];
    return recipients.some((r: any) => r.statusCode === 101 || r.statusCode === 100);
  } catch (err) {
    console.error("[notify-standing-order-setup] SMS error:", err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      target_user_id,
      scheduled_payout_id,
      amount,
      schedule,
      reason,
      next_run_at,
    } = await req.json();

    if (!target_user_id || amount == null) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name, phone, email")
      .eq("id", target_user_id)
      .maybeSingle();

    if (!profile) {
      return new Response(JSON.stringify({ error: "Recipient not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firstName = (profile.full_name || "there").split(" ")[0];
    const amountStr = `UGX ${Number(amount).toLocaleString()}`;
    const scheduleLabel = schedule || "on a recurring basis";
    let nextRunLabel = "";
    if (next_run_at) {
      try {
        nextRunLabel = new Date(next_run_at).toLocaleString("en-GB", {
          day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
        });
      } catch { /* ignore */ }
    }

    // 1) SMS to the recipient confirming the standing order is set.
    let smsSent = false;
    if (profile.phone) {
      const msg = `Hi ${firstName}, WELILE has set up an automatic payout of ${amountStr} to your wallet (${scheduleLabel}). You'll get a message each time it runs. welilereceipts.com`;
      smsSent = await sendSMS(profile.phone, msg);
    }

    // 2) Email to the recipient (skip synthetic @welile.user addresses).
    let emailSent = false;
    if (profile.email && !profile.email.endsWith("@welile.user")) {
      try {
        const { error: emailErr } = await adminClient.functions.invoke("send-transactional-email", {
          body: {
            templateName: "standing-order-created",
            recipientEmail: profile.email,
            idempotencyKey: `standing-order-created-${scheduled_payout_id ?? target_user_id}`,
            templateData: {
              recipient_name: profile.full_name || "there",
              amount: Number(amount),
              currency: "UGX",
              schedule: scheduleLabel,
              reason: reason || "",
              next_run: nextRunLabel,
            },
          },
        });
        emailSent = !emailErr;
        if (emailErr) console.error("[notify-standing-order-setup] email invoke error:", emailErr);
      } catch (e) {
        console.error("[notify-standing-order-setup] email invoke failed:", e);
      }
    }

    return new Response(JSON.stringify({ success: true, sms_sent: smsSent, email_sent: emailSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[notify-standing-order-setup] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
