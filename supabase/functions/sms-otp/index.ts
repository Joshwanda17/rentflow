import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory rate limiting for OTP sends
const otpSendAttempts = new Map<string, { count: number; firstSent: number }>();
const MAX_SENDS_PER_HOUR = 5;

function checkSendRateLimit(phone: string): boolean {
  const now = Date.now();
  const record = otpSendAttempts.get(phone);
  if (!record || now - record.firstSent > 3600000) {
    otpSendAttempts.set(phone, { count: 1, firstSent: now });
    return true;
  }
  if (record.count >= MAX_SENDS_PER_HOUR) return false;
  record.count++;
  return true;
}

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

async function sendSMS(phone: string, message: string): Promise<boolean> {
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  const username = Deno.env.get("AFRICASTALKING_USERNAME");

  if (!apiKey || !username) {
    console.error("[sms-otp] Missing Africa's Talking credentials");
    return false;
  }

  // Determine base URL: sandbox vs production
  const isSandbox = username.toLowerCase() === "sandbox";
  const baseUrl = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";

  const formattedPhone = formatPhoneInternational(phone);

  try {
    const params = new URLSearchParams({
      username,
      to: formattedPhone,
      message,
    });

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "apiKey": apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: params.toString(),
    });

    const data = await response.json();
    console.log("[sms-otp] AT response:", JSON.stringify(data));

    const recipients = data?.SMSMessageData?.Recipients;
    if (recipients && recipients.length > 0) {
      const status = recipients[0].statusCode;
      // 101 = sent, 100 = queued
      return status === 101 || status === 100;
    }
    return false;
  } catch (error) {
    console.error("[sms-otp] SMS send error:", error);
    return false;
  }
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
      // Rate limit check
      if (!checkSendRateLimit(phoneKey)) {
        return new Response(JSON.stringify({ error: "Too many OTP requests. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour expiry

      // Store OTP in database (upsert by phone)
      const { error: upsertError } = await adminClient
        .from("otp_verifications")
        .upsert(
          {
            phone: phoneKey,
            otp_code: otp,
            expires_at: expiresAt,
            attempts: 0,
            verified: false,
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

      // Send SMS
      const message = `Your Welile verification code is: ${otp}. It expires in 1 hour. Do not share this code.`;
      const sent = await sendSMS(phone, message);

      if (!sent) {
        return new Response(JSON.stringify({ error: "Failed to send SMS. Please try again." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[sms-otp] OTP sent to ***${phoneKey.slice(-4)}`);
      return new Response(JSON.stringify({ success: true, message: "OTP sent successfully" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    return new Response(JSON.stringify({ error: "Invalid action. Use 'send' or 'verify'." }), {
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
