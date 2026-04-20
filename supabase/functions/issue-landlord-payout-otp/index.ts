// Issue OTP for agent-initiated landlord rent payout.
// Validates float, creates an OTP challenge, sends SMS to landlord.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OTP_TTL_SECONDS = 120;

function generateOtp(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += Math.floor(Math.random() * 10).toString();
  return s;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("0")) d = "256" + d.slice(1);
  if (!d.startsWith("256") && d.length === 9) d = "256" + d;
  return "+" + d;
}

async function sendSms(phone: string, message: string): Promise<boolean> {
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  const username = Deno.env.get("AFRICASTALKING_USERNAME");
  if (!apiKey || !username) {
    console.warn("[issue-landlord-payout-otp] Missing Africa's Talking creds — skipping SMS");
    return false;
  }
  const isSandbox = username.toLowerCase() === "sandbox";
  const baseUrl = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
  try {
    const params = new URLSearchParams({ username, to: phone, message, from: "Welile" });
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { apiKey, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: params.toString(),
    });
    return res.ok;
  } catch (e) {
    console.error("[issue-landlord-payout-otp] SMS error:", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Missing authorization" }, 401);
    const { data: u, error: uErr } = await admin.auth.getUser(auth.replace("Bearer ", ""));
    if (uErr || !u?.user) return json({ error: "Invalid token" }, 401);
    const agentId = u.user.id;

    const body = await req.json().catch(() => ({}));
    const {
      landlord_id,
      landlord_name,
      landlord_phone,
      tenant_id,
      tenant_name,
      tenant_phone,
      rent_request_id,
      amount,
      mobile_money_provider,
      agent_latitude,
      agent_longitude,
      property_latitude,
      property_longitude,
      challenge_id, // optional: resend OTP for existing challenge
    } = body ?? {};

    // Resend path
    if (challenge_id) {
      const { data: existing } = await admin
        .from("landlord_payout_otp_challenges")
        .select("*")
        .eq("id", challenge_id)
        .eq("agent_id", agentId)
        .maybeSingle();
      if (!existing) return json({ error: "Challenge not found" }, 404);
      if (existing.status !== "pending") return json({ error: "Challenge no longer pending" }, 400);

      const otp = generateOtp();
      const otp_hash = await sha256(otp);
      const otp_expires_at = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();
      await admin
        .from("landlord_payout_otp_challenges")
        .update({ otp_hash, otp_expires_at, attempts: 0 })
        .eq("id", challenge_id);

      const phone = normalizePhone(existing.landlord_phone);
      await sendSms(
        phone,
        `Welile: You are receiving UGX ${Number(existing.amount).toLocaleString()} as rent. OTP: ${otp}. Valid 2 min. Share with the agent ONLY if you want to receive this money.`,
      );
      return json({ success: true, challenge_id, expires_at: otp_expires_at });
    }

    // Validation
    if (!landlord_id || !landlord_name || !landlord_phone || !amount || !mobile_money_provider) {
      return json({ error: "Missing required fields" }, 400);
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return json({ error: "Invalid amount" }, 400);
    if (!["MTN", "Airtel"].includes(mobile_money_provider)) {
      return json({ error: "Invalid provider" }, 400);
    }
    if (!/^\+?\d{9,15}$/.test(String(landlord_phone).replace(/\s|-/g, ""))) {
      return json({ error: "Invalid landlord phone" }, 400);
    }

    // Eligibility check (float, cutoff, landlord status) — same gate as final insert
    const { data: elig, error: eligErr } = await admin.rpc("check_landlord_payout_eligibility", {
      p_agent_id: agentId,
      p_landlord_id: landlord_id,
      p_amount: amt,
    });
    if (eligErr) return json({ error: eligErr.message }, 400);
    if (elig && (elig as any).eligible === false) {
      const e = elig as any;
      const reasons: string[] = [];
      if (e.float_ok === false) {
        reasons.push(`Insufficient float (have UGX ${Number(e.current_float ?? 0).toLocaleString()}, need UGX ${amt.toLocaleString()})`);
      }
      if (e.cutoff_ok === false) reasons.push("Outside payout cutoff window");
      if (e.landlord_verified === false) reasons.push("Landlord not verified for payouts");
      const reason = reasons.length ? reasons.join("; ") : (e.reason ?? "Not eligible for payout");
      return json({ error: reason, details: e }, 400);
    }

    // Generate OTP and persist challenge
    const otp = generateOtp();
    const otp_hash = await sha256(otp);
    const otp_expires_at = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();

    const { data: challenge, error: insErr } = await admin
      .from("landlord_payout_otp_challenges")
      .insert({
        agent_id: agentId,
        landlord_id,
        tenant_id: tenant_id ?? null,
        rent_request_id: rent_request_id ?? null,
        amount: amt,
        landlord_name,
        landlord_phone,
        tenant_name: tenant_name ?? null,
        tenant_phone: tenant_phone ?? null,
        mobile_money_provider,
        otp_hash,
        otp_expires_at,
        agent_latitude: agent_latitude ?? null,
        agent_longitude: agent_longitude ?? null,
        property_latitude: property_latitude ?? null,
        property_longitude: property_longitude ?? null,
      })
      .select("id")
      .single();

    if (insErr || !challenge) {
      console.error("[issue-landlord-payout-otp] insert failed", insErr);
      return json({ error: insErr?.message ?? "Could not create challenge" }, 500);
    }

    const phone = normalizePhone(landlord_phone);
    const sent = await sendSms(
      phone,
      `Welile: You are receiving UGX ${amt.toLocaleString()} as rent${tenant_name ? ` from ${tenant_name}` : ""}. OTP: ${otp}. Valid 2 min. Share with the agent ONLY if you want to receive this money.`,
    );

    return json({
      success: true,
      challenge_id: challenge.id,
      expires_at: otp_expires_at,
      sms_sent: sent,
    });
  } catch (e) {
    console.error("[issue-landlord-payout-otp] error", e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }

  function json(b: unknown, status = 200) {
    return new Response(JSON.stringify(b), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});