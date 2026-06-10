// Cash-with-agent deposit — Resend OTP.
// The depositor can request a fresh confirmation code for an existing
// pending session. We generate a new PIN, refresh the expiry, and re-send
// the SMS to the agent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function gen4DigitPin(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
  return String(n).padStart(4, "0");
}

function normalizePhone(raw: string): string {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "256" + d.slice(1);
  if (!d.startsWith("256") && d.length === 9) d = "256" + d;
  return "+" + d;
}

// Yoola is the PRIMARY SMS sender; Africa's Talking is the fallback.
async function sendViaYoola(phone: string, message: string): Promise<boolean> {
  const apiKey = (Deno.env.get("YOOLA_SMS_API_KEY") || "").trim();
  if (!apiKey) return false;
  try {
    const res = await fetch("https://yoolasms.com/api/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ phone: String(phone || "").replace(/\D/g, ""), message, api_key: apiKey }),
    });
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* keep raw text */ }
    const status = String(data?.status ?? "").toLowerCase();
    // Treat any successful HTTP response that Yoola did not explicitly reject as
    // "accepted" so Africa's Talking never double-sends after a real delivery.
    const accepted =
      res.ok &&
      (status === "success" || status === "ok" || status === "sent" || status === "queued" ||
        (!data?.error && status === ""));
    return accepted;
  } catch (e) {
    console.error("[agent-cash-resend] Yoola error:", e);
    return false;
  }
}

async function sendViaAfricasTalking(phone: string, message: string): Promise<boolean> {
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  const username = Deno.env.get("AFRICASTALKING_USERNAME");
  if (!apiKey || !username) {
    console.warn("[agent-cash-resend] Missing Africa's Talking creds — skipping AT");
    return false;
  }
  const isSandbox = username.toLowerCase() === "sandbox";
  const baseUrl = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
  try {
    const params = new URLSearchParams({ username, to: phone, message, from: "WELILE" });
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { apiKey, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: params.toString(),
    });
    return res.ok;
  } catch (e) {
    console.error("[agent-cash-resend] AT SMS error:", e);
    return false;
  }
}

async function sendSms(phone: string, message: string): Promise<boolean> {
  if (await sendViaYoola(phone, message)) return true;
  console.warn("[agent-cash-resend] Yoola not accepted — falling back to Africa's Talking");
  return await sendViaAfricasTalking(phone, message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !authData?.user) return json(401, { error: "Unauthorized" });
    const depositor = authData.user;

    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body?.session_id === "string" ? body.session_id : "";
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(sessionId)) {
      return json(400, { error: "invalid_request", message: "Missing deposit reference" });
    }

    // ── Load and validate the session ──
    const { data: session, error: sErr } = await admin
      .from("agent_cash_deposit_sessions")
      .select("id, depositor_id, depositor_name, agent_id, agent_phone, amount, pin, status, expires_at")
      .eq("id", sessionId)
      .eq("depositor_id", depositor.id)
      .maybeSingle();

    if (sErr || !session) {
      return json(404, { error: "not_found", message: "No pending cash deposit found." });
    }
    const s = session as any;

    if (s.status !== "pending") {
      return json(410, { error: "not_active", message: "This deposit is no longer active. Please start a new one." });
    }

    // ── Refresh PIN and expiry ──
    const newPin = gen4DigitPin();
    const newExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { error: updErr } = await admin
      .from("agent_cash_deposit_sessions")
      .update({ pin: newPin, expires_at: newExpiresAt, attempts: 0 })
      .eq("id", s.id);

    if (updErr) {
      console.error("[agent-cash-resend] update failed", updErr);
      return json(500, { error: "update_failed", message: "Could not refresh the confirmation code" });
    }

    // ── Re-send SMS to the agent ──
    const agentPhoneForSms = normalizePhone(s.agent_phone ?? "");
    const smsSent = await sendSms(
      agentPhoneForSms,
      `Welile: ${s.depositor_name ?? "A user"} is collecting UGX ${Number(s.amount).toLocaleString()} cash from your float. NEW confirmation code: ${newPin}. Share it ONLY after handing over the cash. Your float will reduce by this amount.`,
    );

    return json(200, {
      ok: true,
      session_id: s.id,
      expires_at: newExpiresAt,
      sms_sent: smsSent,
    });
  } catch (e) {
    console.error("[agent-cash-resend] error", e);
    return json(500, { error: "server_error", message: String((e as Error)?.message ?? e) });
  }
});
