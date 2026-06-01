// Cash deposit — Step 2: the depositor enters the receipt code that the
// verifier (weliletenants@gmail.com) read back to them after receiving the
// cash. We hash the entered code, compare it to the stored hash, enforce
// expiry + attempt limits, and on a match auto-credit the wallet via
// approve-deposit (system_auto_credit) and email the depositor a confirmation
// with the verified amount and their updated balance (existing Gmail).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

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
  if (!LOVABLE_API_KEY || !GOOGLE_MAIL_API_KEY) {
    throw new Error("Gmail is not configured");
  }
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
  `UGX ${Math.round(Number(n) || 0).toLocaleString("en-UG")}`;

// Append an audit-trail event. Never throws — auditing must not break the flow.
async function logEvent(
  admin: ReturnType<typeof createClient>,
  row: {
    verification_id?: string | null;
    deposit_request_id?: string | null;
    user_id?: string | null;
    event_type: string;
    attempt_no?: number | null;
    attempts_remaining?: number | null;
    amount?: number | null;
    detail?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    await admin.from("cash_deposit_verification_events").insert({
      verification_id: row.verification_id ?? null,
      deposit_request_id: row.deposit_request_id ?? null,
      user_id: row.user_id ?? null,
      event_type: row.event_type,
      attempt_no: row.attempt_no ?? null,
      attempts_remaining: row.attempts_remaining ?? null,
      amount: row.amount ?? null,
      detail: row.detail ?? null,
      metadata: row.metadata ?? {},
    } as any);
  } catch (e) {
    console.error("[cash-verify-code] audit log failed", row.event_type, e);
  }
}

// Normalize the entered code so the user can be a little sloppy: uppercase,
// strip spaces/dashes, and ensure the RCT prefix.
function normalizeCode(input: string): string {
  let s = String(input || "").toUpperCase().replace(/[\s-]+/g, "").trim();
  if (s && !s.startsWith("RCT")) s = `RCT${s}`;
  return s;
}

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // ── Auth ──
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return json(401, { error: "Unauthorized" });
    }
    const user = authData.user;

    const body = await req.json().catch(() => ({}));
    const depositId = typeof body?.deposit_request_id === "string" ? body.deposit_request_id : "";
    const enteredCode = normalizeCode(body?.code);
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(depositId)) {
      return json(400, { error: "invalid_request", message: "Missing deposit reference" });
    }
    if (!enteredCode || enteredCode.length < 4) {
      return json(400, { error: "invalid_code", message: "Enter the receipt code" });
    }

    // ── Load the verification row (scoped to this user) ──
    const { data: ver, error: verErr } = await admin
      .from("cash_deposit_verifications")
      .select("id, deposit_request_id, user_id, amount, code_hash, attempts, max_attempts, status, expires_at")
      .eq("deposit_request_id", depositId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (verErr || !ver) {
      return json(404, { error: "not_found", message: "No pending cash deposit found for this code." });
    }

    if (ver.status === "verified") {
      return json(200, { ok: true, already_verified: true, message: "This deposit was already verified." });
    }

    // ── Expiry ──
    const now = Date.now();
    const expired = ver.status === "expired" || new Date(ver.expires_at).getTime() < now;
    if (expired) {
      if (ver.status !== "expired") {
        await admin.from("cash_deposit_verifications").update({ status: "expired" }).eq("id", ver.id);
      }
      return json(410, { error: "expired", message: "This code has expired. Please start a new cash deposit." });
    }

    // ── Attempt limit ──
    if (Number(ver.attempts) >= Number(ver.max_attempts)) {
      await admin.from("cash_deposit_verifications").update({ status: "expired" }).eq("id", ver.id);
      return json(429, { error: "too_many_attempts", message: "Too many incorrect attempts. Please start a new cash deposit." });
    }

    // ── Compare hashes ──
    const enteredHash = await sha256Hex(enteredCode);
    if (enteredHash !== ver.code_hash) {
      const newAttempts = Number(ver.attempts) + 1;
      const remaining = Math.max(0, Number(ver.max_attempts) - newAttempts);
      const lockNow = remaining <= 0;
      await admin
        .from("cash_deposit_verifications")
        .update({ attempts: newAttempts, ...(lockNow ? { status: "expired" } : {}) })
        .eq("id", ver.id);
      return json(400, {
        error: "code_mismatch",
        message: lockNow
          ? "Incorrect code. Too many attempts — please start a new cash deposit."
          : `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`,
        attempts_remaining: remaining,
      });
    }

    // ── Match! Mark verified BEFORE crediting (idempotency guard) ──
    const { data: claimed, error: claimErr } = await admin
      .from("cash_deposit_verifications")
      .update({
        status: "verified",
        attempts: Number(ver.attempts) + 1,
        verified_at: new Date().toISOString(),
      })
      .eq("id", ver.id)
      .eq("status", "awaiting_code")
      .select("id")
      .maybeSingle();

    if (claimErr || !claimed) {
      // Another concurrent verify already claimed it.
      return json(200, { ok: true, already_verified: true, message: "This deposit was already verified." });
    }

    // Stamp the verified RCT code onto the deposit request for traceability.
    await admin
      .from("deposit_requests")
      .update({ transaction_id: enteredCode })
      .eq("id", depositId)
      .eq("status", "pending");

    // ── Auto-credit via approve-deposit (service role, system credit) ──
    const approveRes = await fetch(`${supabaseUrl}/functions/v1/approve-deposit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        deposit_request_id: depositId,
        action: "approve",
        system_auto_credit: true,
      }),
    });
    const approveJson = await approveRes.json().catch(() => ({}));
    if (!approveRes.ok || (approveJson?.error && !approveJson?.success && !approveJson?.already_processed)) {
      // Crediting failed — roll the verification back so the user can retry.
      await admin
        .from("cash_deposit_verifications")
        .update({ status: "awaiting_code", verified_at: null })
        .eq("id", ver.id);
      console.error("[cash-verify-code] approve-deposit failed", approveRes.status, approveJson);
      return json(502, {
        error: "credit_failed",
        message: "Code verified, but crediting your wallet failed. Please try again.",
      });
    }

    // ── New balance for the confirmation email ──
    let newBalance: number | null = null;
    try {
      const { data: bal } = await admin.rpc("get_user_available_balance", { p_user_id: user.id });
      if (bal != null) newBalance = Number(bal);
    } catch (_) { /* non-fatal */ }

    // ── Confirmation email to the depositor (verified amount + new balance) ──
    const recipientEmail = user.email;
    if (recipientEmail) {
      try {
        const { data: profile } = await admin
          .from("profiles").select("full_name").eq("id", user.id).maybeSingle();
        const name = profile?.full_name || "there";
        const subject = `Cash deposit confirmed — ${fmtUGX(ver.amount)}`;
        const lines = [
          `Hi ${name},`,
          "",
          "Your cash deposit has been verified and credited to your Welile wallet.",
          "",
          `Amount credited:  ${fmtUGX(ver.amount)}`,
          `Receipt code:     ${enteredCode}`,
          newBalance != null ? `New balance:      ${fmtUGX(newBalance)}` : "",
          `Confirmed:        ${new Date().toLocaleString("en-UG")}`,
          "",
          "Thank you for using Welile.",
        ].filter(Boolean).join("\n");
        await sendGmail(recipientEmail, subject, lines);
      } catch (mailErr) {
        // Non-fatal: the money is already credited.
        console.error("[cash-verify-code] confirmation email failed", mailErr);
      }
    }

    return json(200, {
      ok: true,
      verified: true,
      amount: Number(ver.amount),
      new_balance: newBalance,
      message: "Cash deposit verified and credited.",
    });
  } catch (e) {
    console.error("[cash-verify-code] error", e);
    return json(500, { error: "server_error", message: String((e as Error)?.message ?? e) });
  }
});