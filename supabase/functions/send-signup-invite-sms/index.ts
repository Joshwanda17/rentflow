// Sends a sign-up invite SMS to a tenant and/or landlord when an agent posts a
// rent request. For each recipient we:
//   1. Check if they are already a Welile user (by phone). If so, skip — no SMS.
//   2. If not, make sure there's a pending invite (reuse the activation token
//      from register-tenant for tenants, or create a supporter_invites row for
//      landlords) and text them a one-tap /join link to claim their free account.
//
// Fire-and-forget from the client: it must never block or fail rent submission.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VALID_ROLES = ["tenant", "landlord"] as const;
type InviteRole = (typeof VALID_ROLES)[number];

function toDigits(v: string): string {
  return (v || "").replace(/[^0-9]/g, "");
}

function last9(v: string): string | null {
  const d = toDigits(v);
  if (!d) return null;
  const l9 = d.length >= 9 ? d.slice(-9) : d;
  return l9.length === 9 ? l9 : null;
}

function formatPhoneInternational(phone: string): string {
  const digits = toDigits(phone);
  if (!digits) return "";
  if (digits.startsWith("256")) return `+${digits}`;
  if (digits.startsWith("0")) return `+256${digits.slice(1)}`;
  if (digits.length === 9) return `+256${digits}`;
  return `+${digits}`;
}

// Yoola is the PRIMARY SMS provider. JSON body { phone, message, api_key }
// posted to https://yoolasms.com/api/v1/send; { status: "success" } = accepted.
// Phone is digits only with country code, no leading "+".
async function sendViaYoola(phone: string, message: string): Promise<boolean> {
  // Trim — Yoola returns 403 "invalidkey" if the key has surrounding whitespace.
  const apiKey = Deno.env.get("YOOLA_SMS_API_KEY")?.trim();
  if (!apiKey) {
    console.warn("[send-signup-invite-sms] Yoola not configured");
    return false;
  }
  const phoneYoola = formatPhoneInternational(phone).replace(/^\+/, "");
  if (!phoneYoola) return false;
  try {
    const res = await fetch("https://yoolasms.com/api/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ phone: phoneYoola, message, api_key: apiKey }),
    });
    const raw = await res.text();
    let data: any;
    try { data = JSON.parse(raw); } catch { data = null; }
    const ok = res.ok && String(data?.status ?? "").toLowerCase() === "success";
    console.log(`[send-signup-invite-sms] Yoola to=${phoneYoola} ok=${ok} status=${res.status}`);
    return ok;
  } catch (err) {
    console.error("[send-signup-invite-sms] Yoola send failed:", err);
    return false;
  }
}

// Africa's Talking — used only as a FALLBACK when Yoola is not accepted.
async function sendViaAfricasTalking(phone: string, message: string): Promise<boolean> {
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  const username = Deno.env.get("AFRICASTALKING_USERNAME");
  if (!apiKey || !username) {
    console.error("[send-signup-invite-sms] Missing AT credentials");
    return false;
  }
  const isSandbox = username.toLowerCase() === "sandbox";
  const baseUrl = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";

  const to = formatPhoneInternational(phone);
  if (!to) return false;

  try {
    const body = new URLSearchParams({ username, to, message, from: "WELILE" });
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
      console.error("[send-signup-invite-sms] Non-JSON AT response:", raw);
      return false;
    }
    const recipients = data?.SMSMessageData?.Recipients || [];
    const ok = recipients.some(
      (r: any) => r.statusCode === 100 || r.statusCode === 101,
    );
    console.log(`[send-signup-invite-sms] AT to=${to} ok=${ok} status=${res.status}`);
    return ok;
  } catch (err) {
    console.error("[send-signup-invite-sms] AT send failed:", err);
    return false;
  }
}

// Provider chain: Yoola (primary) → Africa's Talking (fallback). Tried one at a
// time — AT only fires if Yoola is unconfigured or did not accept the message.
async function sendSMS(phone: string, message: string): Promise<boolean> {
  if (await sendViaYoola(phone, message)) return true;
  console.warn("[send-signup-invite-sms] Yoola not accepted; trying Africa's Talking");
  return await sendViaAfricasTalking(phone, message);
}

function buildMessage(role: InviteRole, fullName: string, link: string): string {
  const first = (fullName || "").trim().split(/\s+/)[0] || "there";
  if (role === "landlord") {
    return `Hi ${first}, you've been added as a landlord on Welile. Create your free account to track rent payouts: ${link}`;
  }
  return `Hi ${first}, you've been added on Welile. Create your free account to track your rent: ${link}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user: caller }, error: authErr } = await adminClient.auth.getUser(token);
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const origin = typeof body?.origin === "string" && body.origin.startsWith("http")
      ? body.origin.replace(/\/+$/, "")
      : "https://welilereceipts.com";
    const recipientsIn = Array.isArray(body?.recipients) ? body.recipients : [];

    const results: Array<{ role: string; phone: string; outcome: string }> = [];

    for (const r of recipientsIn) {
      const role: InviteRole | null = VALID_ROLES.includes(r?.role) ? r.role : null;
      const fullName = typeof r?.full_name === "string" ? r.full_name.trim() : "";
      const phone = typeof r?.phone === "string" ? r.phone.trim() : "";
      const providedToken = typeof r?.activation_token === "string" ? r.activation_token : null;
      const l9 = last9(phone);

      if (!role || !l9) {
        results.push({ role: String(r?.role ?? "?"), phone, outcome: "invalid" });
        continue;
      }

      // 1) Already a Welile user? Skip — they can just sign in.
      const { data: existingProfile } = await adminClient
        .from("profiles")
        .select("id")
        .like("phone", `%${l9}`)
        .limit(1)
        .maybeSingle();

      if (existingProfile) {
        results.push({ role, phone, outcome: "existing_user" });
        continue;
      }

      // 2) Resolve an activation token to point the invite link at.
      let activationToken = providedToken;

      if (!activationToken) {
        // Reuse a pending invite if one already exists for this phone.
        const { data: pending } = await adminClient
          .from("supporter_invites")
          .select("activation_token")
          .eq("status", "pending")
          .like("phone", `%${l9}`)
          .limit(1)
          .maybeSingle();

        if (pending?.activation_token) {
          activationToken = pending.activation_token as string;
        } else {
          // Create a fresh invite (landlord path — no auth user yet).
          const cleanPhone = phone.replace(/\s/g, "");
          const virtualEmail = `${toDigits(phone)}@welile.user`;
          const tempPassword = crypto.randomUUID().slice(0, 12) + "Aa1!";
          const { data: invite, error: inviteErr } = await adminClient
            .from("supporter_invites")
            .insert({
              full_name: fullName || `User ${l9.slice(-4)}`,
              phone: cleanPhone,
              email: virtualEmail,
              temp_password: tempPassword,
              role,
              created_by: caller.id,
              status: "pending",
            })
            .select("activation_token")
            .single();

          if (inviteErr || !invite?.activation_token) {
            console.error("[send-signup-invite-sms] invite insert failed:", inviteErr?.message);
            results.push({ role, phone, outcome: "invite_failed" });
            continue;
          }
          activationToken = invite.activation_token as string;
        }
      }

      const link = `${origin}/join?t=${activationToken}`;
      const ok = await sendSMS(phone, buildMessage(role, fullName, link));
      results.push({ role, phone, outcome: ok ? "sms_sent" : "sms_failed" });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[send-signup-invite-sms] Unhandled error:", error?.message || error);
    return new Response(JSON.stringify({ error: error?.message || "Service error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});