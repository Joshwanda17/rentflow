// Partner Ops → creates an *inert* portfolio for an EXISTING partner and emails
// the partner a secure one-tap link to complete missing details + sign.
//
// No wallet is debited. No ledger row is written. The portfolio sits at
// status='awaiting_partner_details' until the partner completes it, then flips
// to 'pending_ops_approval'. Ops approves via approve-pending-portfolio, which
// flips it to 'active' and dispatches the existing partnership-agreement email.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cryptographically strong URL-safe token
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !caller) return json({ error: "Unauthorized" }, 401);

    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

    const partnerId = String(body?.partner_id || "");
    const amount = Number(body?.amount);
    const durationMonths = Number(body?.duration_months);
    const roiPercentage = Number(body?.roi_percentage);
    const roiMode = String(body?.roi_mode || "monthly_payout");
    const nickname = body?.nickname ? String(body.nickname).slice(0, 120) : null;

    if (!UUID.test(partnerId)) return json({ error: "Invalid partner ID" }, 400);
    if (!Number.isFinite(amount) || amount < 20000) return json({ error: "Amount must be at least UGX 20,000" }, 400);
    if (!Number.isFinite(durationMonths) || durationMonths < 1 || durationMonths > 60) {
      return json({ error: "Duration must be between 1 and 60 months" }, 400);
    }
    if (!Number.isFinite(roiPercentage) || roiPercentage <= 0 || roiPercentage > 100) {
      return json({ error: "ROI % must be between 0 and 100" }, 400);
    }
    if (!["monthly_payout", "monthly_compounding"].includes(roiMode)) {
      return json({ error: "Invalid ROI mode" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Look up partner contact info up-front so we can email them.
    const { data: partner, error: partnerErr } = await admin
      .from("profiles")
      .select("id, full_name, email, phone, frozen_at")
      .eq("id", partnerId)
      .maybeSingle();
    if (partnerErr) return json({ error: `Partner lookup failed: ${partnerErr.message}` }, 500);
    if (!partner) return json({ error: "Partner not found" }, 404);
    if ((partner as any).frozen_at) {
      return json({
        error: "This partner's account is suspended. Unfreeze the account before creating a new portfolio.",
      }, 403);
    }
    if (!partner.email) {
      return json({ error: "Partner has no email on file — add one before sending an invite." }, 400);
    }

    // Verify the user is a partner: either explicitly tagged as supporter or
    // already holding an investor portfolio from the legacy onboarding flow.
    const [{ data: role }, { data: existingPortfolio }] = await Promise.all([
      admin
        .from("user_roles").select("id")
        .eq("user_id", partnerId).eq("role", "supporter").maybeSingle(),
      admin
        .from("investor_portfolios").select("id")
        .eq("investor_id", partnerId).limit(1).maybeSingle(),
    ]);
    if (!role && !existingPortfolio) {
      return json({ error: "Selected user is not a registered partner" }, 400);
    }

    const rawToken = generateToken();

    // RPC creates the pending portfolio + hashed token in one transactional step.
    // It also runs the Ops-role guard server-side.
    const { data: rpcData, error: rpcErr } = await userClient.rpc("create_pending_portfolio", {
      p_partner_id: partnerId,
      p_amount: amount,
      p_duration_months: durationMonths,
      p_roi_percentage: roiPercentage,
      p_roi_mode: roiMode,
      p_nickname: nickname,
      p_raw_token: rawToken,
    });
    if (rpcErr) {
      const msg = rpcErr.message || "";
      if (msg.includes("NOT_AUTHORIZED")) {
        return json({ error: "You do not have permission to create portfolios." }, 403);
      }
      if (msg.includes("PARTNER_MISSING_CONTACT")) {
        return json({ error: "Partner has no email or phone on file." }, 400);
      }
      if (msg.includes("INVALID_")) {
        return json({ error: "Portfolio details invalid — please review the form." }, 400);
      }
      return json({ error: `Could not create pending portfolio: ${msg}` }, 500);
    }

    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    const portfolioId = row?.portfolio_id;
    const portfolioCode = row?.portfolio_code;

    // Build the completion URL. Origin comes from the request so the same
    // function works in preview + production without extra config.
    const origin = req.headers.get("origin") || "https://welileapp.com";
    const completionUrl =
      `${origin}/partners/${partnerId}/portfolios/${portfolioId}/complete?token=${encodeURIComponent(rawToken)}`;

    // Send the invite email via existing send-transactional-email pipeline.
    // We reuse the plain 'transactional' template with inline HTML — no new
    // Mailgun template needed for MVP.
    const partnerName = partner.full_name || "Partner";
    let emailDispatched = false;
    let emailError: string | null = null;
    try {
      const { data: emailData, error: emailErr } = await admin.functions.invoke(
        "send-transactional-email",
        {
          body: {
            templateName: "partner-portfolio-invite",
            recipientEmail: partner.email,
            idempotencyKey: `portfolio-invite-${portfolioId}`,
            templateData: {
              partner_name: partnerName,
              portfolio_code: portfolioCode,
              amount,
              duration_months: durationMonths,
              roi_percentage: roiPercentage,
              roi_mode: roiMode,
              completion_url: completionUrl,
              currency: "UGX",
              company_name: "Welile",
            },
          },
        },
      );
      if (emailErr) {
        emailError = emailErr.message || String(emailErr);
        console.error("[create-portfolio-invite] Email dispatch error:", emailError, emailData);
      } else {
        emailDispatched = true;
        console.log("[create-portfolio-invite] Invite email enqueued", { portfolioId, to: partner.email });
      }
    } catch (e) {
      emailError = (e as Error)?.message || "unknown";
      console.error("[create-portfolio-invite] Email dispatch threw:", emailError);
    }

    return json({
      success: true,
      portfolio_id: portfolioId,
      portfolio_code: portfolioCode,
      completion_url: completionUrl,
      partner_email: partner.email,
      email_dispatched: emailDispatched,
      email_error: emailError,
    }, 200);
  } catch (e) {
    console.error("[create-portfolio-invite] Fatal:", (e as Error)?.message, (e as Error)?.stack);
    return json({ error: (e as Error)?.message || "Unexpected server error" }, 500);
  }
});