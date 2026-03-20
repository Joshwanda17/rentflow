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
    const { phone, agent_name } = await req.json();

    if (!phone) {
      return new Response(JSON.stringify({ error: "Phone number is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const digits = phone.replace(/\D/g, "");
    const last9 = digits.slice(-9);
    const fullPhone = digits.startsWith("256") ? digits : `256${last9}`;

    // Check if user exists
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, email, full_name")
      .in("phone", [`0${last9}`, `256${last9}`, last9])
      .limit(1);

    const userExists = profiles && profiles.length > 0;
    const profile = profiles?.[0];

    // Generate a short-lived OTP for the link
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    // Store OTP
    await adminClient.from("otp_verifications").upsert({
      phone: fullPhone,
      otp_code: otp,
      expires_at: expiresAt,
      verified: false,
      attempts: 0,
    }, { onConflict: "phone" });

    // Build the deep link
    const baseUrl = "https://welilereceipts.com";
    const linkParams = new URLSearchParams({
      phone: last9,
      token: otp,
      ...(agent_name ? { agent: agent_name } : {}),
    });

    const loginUrl = `${baseUrl}/auth?${linkParams.toString()}`;

    // Build WhatsApp share message
    const greeting = profile?.full_name ? `Hi ${profile.full_name}` : "Hi";
    const agentLine = agent_name ? `Your agent ${agent_name} sent you this link.` : "";
    const message = userExists 
      ? `${greeting}! 👋\n\n${agentLine}\nTap below to log into Welile instantly:\n${loginUrl}\n\n(This link expires in 10 minutes)`
      : `${greeting}! 👋\n\n${agentLine}\nWelcome to Welile - your rent facilitation platform.\n\nTap below to get started:\n${loginUrl}\n\n(This link expires in 10 minutes)`;

    const whatsappUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;

    console.log(`[whatsapp-login-link] Generated link for ${userExists ? "existing" : "new"} user ***${last9.slice(-4)}`);

    return new Response(JSON.stringify({ 
      success: true, 
      login_url: loginUrl,
      whatsapp_url: whatsappUrl,
      user_exists: userExists,
      user_name: profile?.full_name || null,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[whatsapp-login-link] Error:", msg);
    return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
