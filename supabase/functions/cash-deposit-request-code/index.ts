// Cash deposit — Step 1: generate a one-time receipt code and email it to the
// cash verifier (weliletenants@gmail.com). The verifier reads the code back to
// the depositor (after receiving the cash); the depositor enters it in the app
// to auto-credit their wallet (see cash-deposit-verify-code).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VERIFIER_EMAIL = "weliletenants@gmail.com";
const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

// Unambiguous alphabet (no 0/O/1/I) for the receipt code.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateReceiptCode(): string {
  const bytes = new Uint8Array(7);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `RCT${s}`;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function b64url(input: string): string {
  return btoa(unescape(encodeURIComponent(input)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sendGmail(to: string, subject: string, body: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GOOGLE_MAIL_API_KEY = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  if (!GOOGLE_MAIL_API_KEY) throw new Error("GOOGLE_MAIL_API_KEY is not configured (Gmail not connected)");
  const raw = b64url(
    [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      body,
    ].join("\r\n"),
  );
  const res = await fetch(`${GMAIL_GATEWAY}/users/me/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gmail send failed [${res.status}]: ${t}`);
  }
}

const fmtUGX = (n: number) =>
  `UGX ${Math.round(n).toLocaleString("en-UG")}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = authData.user;

    const body = await req.json().catch(() => ({}));
    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: "invalid_amount", message: "Enter a valid amount" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (amount > 50_000_000) {
      return new Response(JSON.stringify({ error: "amount_too_large", message: "Amount exceeds the cash deposit limit" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const allowedPurposes = ["personal_deposit", "operational_float", "other"];
    const depositPurpose = allowedPurposes.includes(String(body?.deposit_purpose))
      ? String(body.deposit_purpose) : "personal_deposit";
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 300) : "";

    // Depositor identity for the verifier email.
    const { data: profile } = await admin
      .from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle();
    const depositorName = profile?.full_name || user.email || "Welile user";
    const depositorPhone = (profile as any)?.phone || "—";

    // 1) Create the pending deposit row. transaction_id is a unique, non-secret
    //    placeholder until the code is verified (then it becomes the RCT code).
    const placeholderRef = `CASHREQ-${crypto.randomUUID().slice(0, 18)}`;
    const purposeLabel =
      depositPurpose === "operational_float" ? "Operational Float"
      : depositPurpose === "other" ? "Other" : "Personal Deposit";
    const notes = [`Purpose: ${purposeLabel}`, "Channel: Cash (code verified)", reason]
      .filter(Boolean).join(" | ");

    const { data: inserted, error: insErr } = await admin
      .from("deposit_requests")
      .insert({
        user_id: user.id,
        amount,
        status: "pending",
        provider: "cash_deposit",
        transaction_id: placeholderRef,
        transaction_date: new Date().toISOString(),
        notes,
        deposit_purpose: depositPurpose,
        purpose_audit: {
          chosen_purpose: depositPurpose,
          chosen_at: new Date().toISOString(),
          chosen_by: user.id,
          entry_point: "cash_code_flow",
          // Pre-confirm personal cash deposits so the agent confirmation
          // guard never blocks a self-service cash deposit.
          agent_personal_confirmed_at: new Date().toISOString(),
        },
      } as any)
      .select("id").single();
    if (insErr || !inserted) {
      console.error("[cash-request-code] insert failed", insErr);
      return new Response(JSON.stringify({ error: "create_failed", message: insErr?.message || "Could not start the deposit" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const depositId = (inserted as any).id as string;

    // 2) Generate + hash the receipt code, store the hash.
    const code = generateReceiptCode();
    const codeHash = await sha256Hex(code);
    const { error: vErr } = await admin.from("cash_deposit_verifications").insert({
      deposit_request_id: depositId,
      user_id: user.id,
      amount,
      code_hash: codeHash,
      emailed_to: VERIFIER_EMAIL,
      status: "awaiting_code",
    } as any);
    if (vErr) {
      console.error("[cash-request-code] verification insert failed", vErr);
      await admin.from("deposit_requests").delete().eq("id", depositId);
      return new Response(JSON.stringify({ error: "create_failed", message: vErr.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Email the code to the verifier.
    const subject = `Cash deposit code ${code} — ${fmtUGX(amount)} from ${depositorName}`;
    const emailBody = [
      "A user has started a CASH deposit and needs you to confirm the cash, then",
      "read the receipt code back to them so they can enter it in the app.",
      "",
      `Receipt code:  ${code}`,
      `Amount:        ${fmtUGX(amount)}`,
      `Depositor:     ${depositorName}`,
      `Phone:         ${depositorPhone}`,
      `Purpose:       ${purposeLabel}`,
      reason ? `Note:          ${reason}` : "",
      `Started:       ${new Date().toLocaleString("en-UG")}`,
      "",
      "Only read this code back AFTER you have received the matching cash.",
      "Entering the code instantly credits the user's wallet. Code expires in 24h.",
    ].filter(Boolean).join("\n");

    try {
      await sendGmail(VERIFIER_EMAIL, subject, emailBody);
    } catch (mailErr) {
      console.error("[cash-request-code] email send failed", mailErr);
      // Keep the pending row; surface a clear error so the user can retry.
      return new Response(JSON.stringify({ error: "email_failed", message: "Could not send the code to the verifier. Please try again." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, deposit_request_id: depositId, verifier: VERIFIER_EMAIL }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[cash-request-code] error", e);
    return new Response(JSON.stringify({ error: "server_error", message: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
