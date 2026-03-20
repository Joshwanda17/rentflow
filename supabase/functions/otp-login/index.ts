import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone, otp } = await req.json();

    if (!phone || !otp) {
      return new Response(JSON.stringify({ error: "Phone and OTP are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Clean phone digits
    const digits = phone.replace(/\D/g, "");
    const last9 = digits.slice(-9);

    // Step 1: Verify OTP from otp_verifications table
    const phoneVariants = [`0${last9}`, `256${last9}`, last9, `+256${last9}`];
    
    const { data: otpRecord, error: otpError } = await adminClient
      .from("otp_verifications")
      .select("*")
      .in("phone", phoneVariants)
      .eq("otp_code", otp)
      .eq("verified", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError || !otpRecord) {
      // Check if expired
      const { data: expiredRecord } = await adminClient
        .from("otp_verifications")
        .select("id")
        .in("phone", phoneVariants)
        .eq("otp_code", otp)
        .eq("verified", false)
        .lte("expires_at", new Date().toISOString())
        .limit(1)
        .maybeSingle();

      if (expiredRecord) {
        return new Response(JSON.stringify({ error: "Code expired. Please request a new one." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Invalid code. Please check and try again." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check attempts
    if (otpRecord.attempts >= 5) {
      return new Response(JSON.stringify({ error: "Too many attempts. Please request a new code." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Increment attempts
    await adminClient
      .from("otp_verifications")
      .update({ attempts: otpRecord.attempts + 1 })
      .eq("id", otpRecord.id);

    // Mark OTP as verified
    await adminClient
      .from("otp_verifications")
      .update({ verified: true, verified_at: new Date().toISOString() })
      .eq("id", otpRecord.id);

    // Step 2: Find user by phone in profiles
    const { data: profileMatches } = await adminClient
      .from("profiles")
      .select("id, email, full_name")
      .in("phone", phoneVariants)
      .limit(5);

    if (!profileMatches?.length) {
      return new Response(JSON.stringify({ error: "No account found with this phone number. Please sign up first." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pick the best match (prefer real email over placeholder)
    const profile = profileMatches.find(p => p.email && !p.email.includes("@welile.")) || profileMatches[0];
    const userId = profile.id;

    // Step 3: Generate a magic link / session via admin API
    // We use generateLink to create a magic link, then exchange it
    const email = profile.email || `${digits}@welile.user`;
    
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: email,
      options: {
        redirectTo: `${req.headers.get("origin") || supabaseUrl}`,
      },
    });

    if (linkError || !linkData) {
      console.error("[otp-login] generateLink error:", linkError);
      return new Response(JSON.stringify({ error: "Failed to create login session. Please try password login." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract the token from the generated link properties
    const tokenHash = linkData.properties?.hashed_token;
    const verifyUrl = `${supabaseUrl}/auth/v1/verify?token=${tokenHash}&type=magiclink&redirect_to=${encodeURIComponent(req.headers.get("origin") || "")}`;

    // Store last login method for the user
    await adminClient
      .from("profiles")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", userId);

    console.log(`[otp-login] OTP login successful for user ${userId}`);

    return new Response(JSON.stringify({ 
      success: true, 
      verify_url: verifyUrl,
      user_name: profile.full_name,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[otp-login] Error:", msg);
    return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
