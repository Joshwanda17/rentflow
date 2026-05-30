import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Durable, database-backed rate limiting for OTP sends.
// These limits persist across page reloads and edge function cold starts,
// so they cannot be bypassed by reloading the OTP screen.
const MAX_SENDS_PER_HOUR = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const HOUR_MS = 3600000;

function generateOTP(): string {
  const digits = "0123456789";
  let otp = "";
  for (let i = 0; i < 6; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

// Known country code prefixes (longest first for greedy matching)
const KNOWN_COUNTRY_CODES = [
  '256', '254', '255', '250', '257', '211', '243', '234', '27', '44', '1',
  // Additional global codes
  '91', '86', '33', '49', '81', '82', '61', '55', '7', '966', '971', '20',
  '212', '233', '225', '221', '260', '263', '267', '251',
];

function formatPhoneInternational(rawPhone: string): string {
  let digits = rawPhone.replace(/\D/g, "");

  // If already has a known country code prefix, just add +
  for (const code of KNOWN_COUNTRY_CODES) {
    if (digits.startsWith(code) && digits.length > code.length + 5) {
      return "+" + digits;
    }
  }

  // Bare local number starting with 0 — default to Uganda (+256)
  if (digits.startsWith("0")) {
    digits = "256" + digits.slice(1);
  }

  return "+" + digits;
}

interface SmsResult {
  /** True when the gateway accepted the message for delivery (statusCode 101/100). */
  accepted: boolean;
  /** Short reason when not accepted, for logging/debugging. */
  reason?: string;
}

// Per-attempt network timeout for the gateway call. Keeps a single stuck
// request from hanging the whole send. Each retry gets its own fresh timeout.
const SMS_ATTEMPT_TIMEOUT_MS = 5000;
// Number of attempts (1 initial + retries) when the gateway times out or errors.
const SMS_MAX_ATTEMPTS = 3;
// Base backoff between retries; grows exponentially (300ms, 600ms, 1200ms...).
const SMS_BACKOFF_BASE_MS = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Single gateway attempt with a hard timeout via AbortController so a slow or
 * stuck provider call can never block indefinitely.
 */
async function sendSMSAttempt(
  baseUrl: string,
  apiKey: string,
  params: URLSearchParams,
): Promise<SmsResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SMS_ATTEMPT_TIMEOUT_MS);
  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "apiKey": apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: params.toString(),
      signal: controller.signal,
    });

    const data = await response.json();
    console.log("[sms-otp] AT response:", JSON.stringify(data));

    const recipients = data?.SMSMessageData?.Recipients;
    if (recipients && recipients.length > 0) {
      const status = recipients[0].statusCode;
      // 101 = sent, 100 = queued (both mean the gateway accepted it)
      if (status === 101 || status === 100) return { accepted: true };
      // A definitive rejection from the gateway — retrying won't help.
      return { accepted: false, reason: `status_${status}` };
    }
    return { accepted: false, reason: "no_recipients" };
  } catch (error) {
    const aborted = (error as Error)?.name === "AbortError";
    console.error(`[sms-otp] SMS attempt ${aborted ? "timed out" : "failed"}:`, error);
    return { accepted: false, reason: aborted ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timer);
  }
}

// Reasons that are transient and worth retrying. Definitive gateway
// rejections (e.g. status_xxx, no_recipients) are not retried.
const RETRYABLE_REASONS = new Set(["timeout", "network_error"]);

async function sendSMS(phone: string, message: string): Promise<SmsResult> {
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  const username = Deno.env.get("AFRICASTALKING_USERNAME");

  if (!apiKey || !username) {
    console.error("[sms-otp] Missing Africa's Talking credentials");
    return { accepted: false, reason: "missing_credentials" };
  }

  // Determine base URL: sandbox vs production
  const isSandbox = username.toLowerCase() === "sandbox";
  const baseUrl = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";

  const formattedPhone = formatPhoneInternational(phone);

  const params = new URLSearchParams({
    username,
    to: formattedPhone,
    message,
    from: "WELILE",
  });

  let last: SmsResult = { accepted: false, reason: "network_error" };
  for (let attempt = 1; attempt <= SMS_MAX_ATTEMPTS; attempt++) {
    last = await sendSMSAttempt(baseUrl, apiKey, params);

    // Success or a definitive rejection — stop immediately.
    if (last.accepted || !RETRYABLE_REASONS.has(last.reason ?? "")) return last;

    // Transient failure — back off (exponential) before the next attempt.
    if (attempt < SMS_MAX_ATTEMPTS) {
      const backoff = SMS_BACKOFF_BASE_MS * 2 ** (attempt - 1);
      console.warn(
        `[sms-otp] retry ${attempt}/${SMS_MAX_ATTEMPTS - 1} after ${last.reason} (backoff ${backoff}ms)`,
      );
      await sleep(backoff);
    }
  }
  return last;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const action = body.action as string;
    const phone = (body.phone as string || "").replace(/\D/g, "");

    if (!phone || phone.length < 9) {
      return new Response(JSON.stringify({ error: "Valid phone number required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize to local 9 digits for storage key
    const phoneKey = phone.slice(-9);

    if (action === "send") {
      const now = Date.now();

      // Load existing record to enforce durable, DB-backed rate limits.
      const { data: existing } = await adminClient
        .from("otp_verifications")
        .select("last_sent_at, send_count, send_window_start")
        .eq("phone", phoneKey)
        .maybeSingle();

      // Cooldown: minimum time between consecutive sends (survives reloads).
      if (existing?.last_sent_at) {
        const elapsed = now - new Date(existing.last_sent_at).getTime();
        const remaining = Math.ceil((RESEND_COOLDOWN_SECONDS * 1000 - elapsed) / 1000);
        if (remaining > 0) {
          return new Response(
            JSON.stringify({
              error: `Please wait ${remaining}s before requesting another code.`,
              retry_after: remaining,
            }),
            {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }

      // Hourly cap: limit total sends within a rolling 1-hour window.
      let windowStart = existing?.send_window_start
        ? new Date(existing.send_window_start).getTime()
        : 0;
      let sendCount = existing?.send_count ?? 0;

      if (!windowStart || now - windowStart > HOUR_MS) {
        // Window expired (or first send) — reset.
        windowStart = now;
        sendCount = 0;
      }

      if (sendCount >= MAX_SENDS_PER_HOUR) {
        const resetIn = Math.ceil((HOUR_MS - (now - windowStart)) / 60000);
        return new Response(
          JSON.stringify({
            error: `Too many code requests. Please try again in about ${resetIn} minute(s).`,
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const otp = generateOTP();
      const expiresAt = new Date(now + 60 * 60 * 1000).toISOString(); // 1 hour expiry

      // Store OTP and updated rate-limit counters (upsert by phone)
      const { error: upsertError } = await adminClient
        .from("otp_verifications")
        .upsert(
          {
            phone: phoneKey,
            otp_code: otp,
            expires_at: expiresAt,
            attempts: 0,
            verified: false,
            last_sent_at: new Date(now).toISOString(),
            send_count: sendCount + 1,
            send_window_start: new Date(windowStart).toISOString(),
            send_status: "pending",
            send_status_reason: null,
            send_status_at: new Date(now).toISOString(),
          },
          { onConflict: "phone" }
        );

      if (upsertError) {
        console.error("[sms-otp] Upsert error:", upsertError);
        return new Response(JSON.stringify({ error: "Failed to generate OTP" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // The OTP is already persisted above. We now wait *briefly* for the
      // gateway to ACCEPT the message (statusCode 101/100) so the button can
      // show real success/failure. Acceptance is fast and is NOT the same as
      // carrier delivery — we never wait for delivery. If the gateway is
      // unusually slow, we stop waiting, return optimistically, and let the
      // send finish in the background.
      const message = `Your Welile verification code is: ${otp}. It expires in 1 hour. Do not share this code.`;

      // Max time we'll block the client on gateway acceptance.
      const ACCEPTANCE_TIMEOUT_MS = 4000;
      const TIMED_OUT = Symbol("timed_out");

      const smsPromise = sendSMS(phone, message);
      const timeoutPromise = new Promise<typeof TIMED_OUT>((resolve) =>
        setTimeout(() => resolve(TIMED_OUT), ACCEPTANCE_TIMEOUT_MS),
      );

      // Persist the gateway-acceptance outcome so the client can poll for it
      // via the "status" action without ever waiting on carrier delivery.
      const recordSendStatus = (result: SmsResult) =>
        adminClient
          .from("otp_verifications")
          .update({
            send_status: result.accepted ? "accepted" : "failed",
            send_status_reason: result.reason ?? null,
            send_status_at: new Date().toISOString(),
          })
          .eq("phone", phoneKey);

      const outcome = await Promise.race([smsPromise, timeoutPromise]);

      if (outcome === TIMED_OUT) {
        // Gateway slow — keep finishing in the background, respond optimistically.
        try {
          (globalThis as any).EdgeRuntime?.waitUntil?.(
            smsPromise
              .then(async (r) => {
                await recordSendStatus(r);
                console.log(
                  `[sms-otp] late acceptance for ***${phoneKey.slice(-4)}: ${r.accepted ? "ok" : r.reason}`,
                );
              })
              .catch((err) => console.error("[sms-otp] background SMS error:", err)),
          );
        } catch (_) {
          // EdgeRuntime not available — nothing else to do.
        }
        return new Response(
          JSON.stringify({ success: true, pending: true, message: "Code is being sent" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Gateway responded in time — report the real result.
      await recordSendStatus(outcome);

      if (!outcome.accepted) {
        console.error(`[sms-otp] gateway rejected send to ***${phoneKey.slice(-4)}: ${outcome.reason}`);
        return new Response(
          JSON.stringify({ error: "Failed to send SMS. Please try again." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      console.log(`[sms-otp] OTP accepted for ***${phoneKey.slice(-4)}`);
      return new Response(JSON.stringify({ success: true, message: "OTP sent successfully" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "status") {
      // Lightweight poll endpoint: reports whether the SMS gateway accepted the
      // most recent send for this phone. Never reflects carrier delivery.
      const { data: statusRow } = await adminClient
        .from("otp_verifications")
        .select("send_status, send_status_reason, send_status_at")
        .eq("phone", phoneKey)
        .maybeSingle();

      return new Response(
        JSON.stringify({
          status: statusRow?.send_status ?? "unknown",
          reason: statusRow?.send_status_reason ?? null,
          updated_at: statusRow?.send_status_at ?? null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "verify") {
      const otpCode = (body.otp as string || "").trim();
      if (!otpCode || otpCode.length !== 6) {
        return new Response(JSON.stringify({ error: "Please enter the 6-digit code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch stored OTP
      const { data: otpRecord, error: fetchError } = await adminClient
        .from("otp_verifications")
        .select("*")
        .eq("phone", phoneKey)
        .maybeSingle();

      if (fetchError || !otpRecord) {
        return new Response(JSON.stringify({ error: "No OTP found. Please request a new code." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if already verified
      if (otpRecord.verified) {
        return new Response(JSON.stringify({ success: true, already_verified: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check expiration
      if (new Date(otpRecord.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "OTP has expired. Please request a new code." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check max attempts (5)
      if (otpRecord.attempts >= 5) {
        return new Response(JSON.stringify({ error: "Too many failed attempts. Please request a new code." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify
      if (otpCode !== otpRecord.otp_code) {
        await adminClient
          .from("otp_verifications")
          .update({ attempts: otpRecord.attempts + 1 })
          .eq("phone", phoneKey);

        const remaining = 4 - otpRecord.attempts;
        return new Response(JSON.stringify({ error: `Invalid code. ${remaining} attempts remaining.` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark as verified
      await adminClient
        .from("otp_verifications")
        .update({ verified: true, verified_at: new Date().toISOString() })
        .eq("phone", phoneKey);

      console.log(`[sms-otp] Phone ***${phoneKey.slice(-4)} verified`);
      return new Response(JSON.stringify({ success: true, message: "Phone verified successfully" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "send_custom" || action === "custom") {
      const message = (body.message as string || "").trim();
      if (!message) {
        return new Response(JSON.stringify({ error: "Message required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const sent = await sendSMS(phone, message);
      if (!sent.accepted) {
        return new Response(JSON.stringify({ error: "Failed to send SMS" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use 'send', 'status', 'verify', or 'custom'." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[sms-otp] Error:", msg);
    return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
