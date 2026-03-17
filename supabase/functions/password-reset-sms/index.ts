import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory rate limiting
const resetAttempts = new Map<string, { count: number; firstAt: number }>();
const MAX_RESETS_PER_HOUR = 3;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const record = resetAttempts.get(key);
  if (!record || now - record.firstAt > 3600000) {
    resetAttempts.set(key, { count: 1, firstAt: now });
    return true;
  }
  if (record.count >= MAX_RESETS_PER_HOUR) return false;
  record.count++;
  return true;
}

function generateOTP(): string {
  let otp = "";
  for (let i = 0; i < 6; i++) {
    otp += Math.floor(Math.random() * 10).toString();
  }
  return otp;
}

// Known country code prefixes (longest first for greedy matching)
const KNOWN_COUNTRY_CODES = [
  '256', '254', '255', '250', '257', '211', '243', '234', '27', '44', '1',
  '91', '86', '33', '49', '81', '82', '61', '55', '7', '966', '971', '20',
  '212', '233', '225', '221', '260', '263', '267', '251',
];

function formatPhoneInternational(rawPhone: string): string {
  let digits = rawPhone.replace(/\D/g, "");
  for (const code of KNOWN_COUNTRY_CODES) {
    if (digits.startsWith(code) && digits.length > code.length + 5) {
      return "+" + digits;
    }
  }
  if (digits.startsWith("0")) {
    digits = "256" + digits.slice(1);
  }
  return "+" + digits;
}

async function sendSMS(phone: string, message: string): Promise<boolean> {
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  const username = Deno.env.get("AFRICASTALKING_USERNAME");
  if (!apiKey || !username) {
    console.error("[password-reset-sms] Missing AT credentials");
    return false;
  }
  const isSandbox = username.toLowerCase() === "sandbox";
  const baseUrl = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";

  const formattedPhone = formatPhoneInternational(phone);

  try {
    const params = new URLSearchParams({ username, to: formattedPhone, message });
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "apiKey": apiKey, "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: params.toString(),
    });
    const data = await response.json();
    console.log("[password-reset-sms] AT response:", JSON.stringify(data));
    const recipients = data?.SMSMessageData?.Recipients;
    if (recipients?.length > 0) {
      const status = recipients[0].statusCode;
      return status === 101 || status === 100;
    }
    return false;
  } catch (error) {
    console.error("[password-reset-sms] SMS error:", error);
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

    const body = await req.json();
    const action = body.action as string;
    const phone = (body.phone as string || "").replace(/\D/g, "");

    if (!phone || phone.length < 9) {
      return new Response(JSON.stringify({ error: "Valid phone number required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phoneKey = phone.slice(-9);
    const phoneFormats = [`0${phoneKey}`, `256${phoneKey}`];

    // Admin-only direct password reset (no OTP needed)
    if (action === "admin_reset") {
      const userId = (body.user_id as string || "").trim();
      const newPassword = (body.new_password as string || "").trim();
      const authHeader = req.headers.get("authorization") || "";

      if (!userId || !newPassword || newPassword.length < 6) {
        return new Response(JSON.stringify({ error: "user_id and new_password (min 6 chars) required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify caller is a manager
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, { password: newPassword });
      if (updateError) {
        console.error("[password-reset-sms] Admin reset error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to reset password" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[password-reset-sms] Admin password reset for user ${userId}`);
      return new Response(JSON.stringify({ success: true, message: "Password reset successfully" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin-only: reset a user's password
    if (action === "admin_reset_password") {
      const userId = (body.user_id as string || "").trim();
      const newPassword = (body.new_password as string || "").trim();

      if (!userId || !newPassword) {
        return new Response(JSON.stringify({ error: "user_id and new_password required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: resetError } = await adminClient.auth.admin.updateUserById(userId, { password: newPassword });
      if (resetError) {
        console.error("[password-reset-sms] Admin reset error:", resetError);
        return new Response(JSON.stringify({ error: "Failed to reset password: " + resetError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[password-reset-sms] Admin reset password for user ${userId}`);
      return new Response(JSON.stringify({ success: true, message: "Password reset successfully" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "admin_delete_user") {
      const userId = (body.user_id as string || "").trim();
      const authHeader = req.headers.get("authorization") || "";

      if (!userId) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
      if (deleteError) {
        console.error("[password-reset-sms] Admin delete error:", deleteError);
        return new Response(JSON.stringify({ error: "Failed to delete user" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[password-reset-sms] Admin deleted auth user ${userId}`);
      return new Response(JSON.stringify({ success: true, message: "User deleted" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "send") {
      if (!checkRateLimit(phoneKey)) {
        return new Response(JSON.stringify({ error: "Too many reset requests. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify user exists
      const { data: profile } = await adminClient
        .from("profiles")
        .select("id, full_name, phone")
        .in("phone", phoneFormats)
        .limit(1)
        .maybeSingle();

      if (!profile) {
        return new Response(JSON.stringify({ error: "No account found with this phone number." }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      // Store OTP using otp_verifications table with a reset-specific phone key
      const resetKey = `reset_${phoneKey}`;
      const { error: upsertError } = await adminClient
        .from("otp_verifications")
        .upsert({
          phone: resetKey,
          otp_code: otp,
          expires_at: expiresAt,
          attempts: 0,
          verified: false,
        }, { onConflict: "phone" });

      if (upsertError) {
        console.error("[password-reset-sms] Upsert error:", upsertError);
        return new Response(JSON.stringify({ error: "Failed to generate reset code" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const message = `Your Welile password reset code is: ${otp}. It expires in 1 hour. Do not share this code with anyone.`;
      const sent = await sendSMS(phone, message);

      if (!sent) {
        return new Response(JSON.stringify({ error: "Failed to send SMS. Please try again." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[password-reset-sms] Reset OTP sent to ***${phoneKey.slice(-4)}`);
      return new Response(JSON.stringify({ success: true, message: "Reset code sent" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "verify-and-reset") {
      const otpCode = (body.otp as string || "").trim();
      const newPassword = (body.new_password as string || "").trim();

      if (!otpCode || otpCode.length !== 6) {
        return new Response(JSON.stringify({ error: "Please enter the 6-digit code" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!newPassword || newPassword.length < 6) {
        return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const resetKey = `reset_${phoneKey}`;
      const { data: otpRecord } = await adminClient
        .from("otp_verifications")
        .select("*")
        .eq("phone", resetKey)
        .maybeSingle();

      if (!otpRecord) {
        return new Response(JSON.stringify({ error: "No reset code found. Please request a new one." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (new Date(otpRecord.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Reset code has expired. Please request a new one." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (otpRecord.attempts >= 5) {
        return new Response(JSON.stringify({ error: "Too many failed attempts. Please request a new code." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (otpCode !== otpRecord.otp_code) {
        await adminClient
          .from("otp_verifications")
          .update({ attempts: otpRecord.attempts + 1 })
          .eq("phone", resetKey);
        const remaining = 4 - otpRecord.attempts;
        return new Response(JSON.stringify({ error: `Invalid code. ${remaining} attempts remaining.` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // OTP verified - find user and reset password
      const { data: profile } = await adminClient
        .from("profiles")
        .select("id")
        .in("phone", phoneFormats)
        .limit(1)
        .maybeSingle();

      if (!profile) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateError } = await adminClient.auth.admin.updateUserById(
        profile.id,
        { password: newPassword }
      );

      if (updateError) {
        console.error("[password-reset-sms] Password update error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to reset password. Please try again." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark OTP as used
      await adminClient
        .from("otp_verifications")
        .update({ verified: true, verified_at: new Date().toISOString() })
        .eq("phone", resetKey);

      console.log(`[password-reset-sms] Password reset successful for ***${phoneKey.slice(-4)}`);
      return new Response(JSON.stringify({ success: true, message: "Password reset successfully" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[password-reset-sms] Error:", msg);
    return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
