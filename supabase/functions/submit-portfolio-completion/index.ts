// Partner → submits missing details + signature; flips portfolio from
// 'awaiting_partner_details' → 'pending_ops_approval'. Emails Partner Ops that
// the portfolio is ready to review, and confirms to the partner.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Please sign in to complete your portfolio." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !caller) return json({ error: "Sign-in expired — please sign in again." }, 401);

    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Invalid request." }, 400); }

    const portfolioId = String(body?.portfolio_id || "");
    const rawToken = String(body?.token || "");
    const nationalId = body?.national_id ? String(body.national_id).trim().slice(0, 40) : null;
    const mobileMoneyName = body?.mobile_money_name ? String(body.mobile_money_name).trim().slice(0, 120) : null;
    const signatureDataUrl: string | null = typeof body?.signature_data_url === "string" ? body.signature_data_url : null;

    if (!UUID.test(portfolioId)) return json({ error: "This invite link is invalid." }, 400);
    if (!rawToken || rawToken.length < 32) return json({ error: "This invite link is invalid." }, 400);
    if (signatureDataUrl && !signatureDataUrl.startsWith("data:image/")) {
      return json({ error: "Signature must be an image." }, 400);
    }
    if (signatureDataUrl && signatureDataUrl.length > 400_000) {
      return json({ error: "Signature image is too large. Please re-sign more compactly." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Auth-gate: the caller MUST own the pending token for this portfolio.
    // The RPC does the token/hash/expiry check server-side.
    const { data: completed, error: rpcErr } = await userClient.rpc("complete_partner_portfolio", {
      p_portfolio_id: portfolioId,
      p_raw_token: rawToken,
    });
    if (rpcErr) {
      const msg = rpcErr.message || "";
      if (msg.includes("TOKEN_ALREADY_USED")) return json({ error: "This invite has already been completed." }, 409);
      if (msg.includes("TOKEN_EXPIRED")) return json({ error: "This invite has expired. Please ask Partner Operations for a new link." }, 410);
      if (msg.includes("TOKEN_MISMATCH") || msg.includes("TOKEN_NOT_FOUND")) return json({ error: "This invite link is not valid." }, 404);
      if (msg.includes("NOT_TOKEN_OWNER")) return json({ error: "This invite belongs to a different account. Please sign in as the invited partner." }, 403);
      if (msg.includes("INVALID_STATUS")) return json({ error: "This portfolio has already moved past the completion stage." }, 409);
      if (msg.includes("AUTH_REQUIRED")) return json({ error: "Please sign in to complete your portfolio." }, 401);
      return json({ error: `Could not submit portfolio: ${msg}` }, 500);
    }

    // Non-blocking profile updates for missing fields.
    const patch: Record<string, unknown> = {};
    if (nationalId) patch.national_id = nationalId;
    if (mobileMoneyName) patch.mobile_money_name = mobileMoneyName;
    if (Object.keys(patch).length > 0) {
      const { error: profErr } = await admin.from("profiles").update(patch).eq("id", caller.id);
      if (profErr) console.warn("[submit-portfolio-completion] Profile patch failed (non-blocking):", profErr.message);
    }

    // Persist signature snapshot on partner_agreements if the column exists on
    // this partner's master agreement — mirrors the memory
    // (mem://features/partner/partner-signature-persistence).
    if (signatureDataUrl) {
      try {
        await admin.from("partner_agreements")
          .update({ partner_signature_data_url: signatureDataUrl })
          .eq("user_id", caller.id)
          .is("partner_signature_data_url", null);
      } catch (e) {
        console.warn("[submit-portfolio-completion] Signature persist failed (non-blocking):", (e as Error)?.message);
      }
    }

    // Fetch portfolio + partner details for the confirmation emails.
    const [{ data: portfolio }, { data: partner }] = await Promise.all([
      admin.from("investor_portfolios")
        .select("id, portfolio_code, investment_amount, roi_percentage, duration_months, roi_mode")
        .eq("id", portfolioId).maybeSingle(),
      admin.from("profiles").select("full_name, email").eq("id", caller.id).maybeSingle(),
    ]);

    const partnerName = partner?.full_name || "Partner";
    const partnerEmail = partner?.email;
    const amountFmt = Number(portfolio?.investment_amount || 0).toLocaleString("en-US");
    const code = portfolio?.portfolio_code || portfolioId.slice(0, 8);

    // Confirmation email → partner (non-blocking).
    if (partnerEmail) {
      try {
        await admin.functions.invoke("send-transactional-email", {
          body: {
            templateName: "generic-transactional",
            recipientEmail: partnerEmail,
            idempotencyKey: `portfolio-completed-partner-${portfolioId}`,
            templateData: {
              subject: `Portfolio ${code} submitted for approval`,
              html: `<div style="font-family:sans-serif;max-width:560px;padding:24px;">
                <h2 style="margin:0 0 12px 0;">Thank you, ${partnerName}</h2>
                <p>Your portfolio <strong>${code}</strong> for <strong>UGX ${amountFmt}</strong> has been submitted to Welile Partner Operations for approval.</p>
                <p>You'll receive the final signed agreement once it's approved. This usually takes 1 business day.</p>
              </div>`,
              partner_name: partnerName,
            },
          },
        });
      } catch (e) { console.warn("[submit-portfolio-completion] Partner email failed:", (e as Error)?.message); }
    }

    // Alert email → Partner Ops mailbox (non-blocking).
    try {
      await admin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "generic-transactional",
          recipientEmail: "partnership@welile.com",
          idempotencyKey: `portfolio-completed-ops-${portfolioId}`,
          templateData: {
            subject: `[Review] ${partnerName} completed portfolio ${code}`,
            html: `<div style="font-family:sans-serif;max-width:560px;padding:24px;">
              <h2 style="margin:0 0 12px 0;">Portfolio ready for approval</h2>
              <p><strong>${partnerName}</strong> has submitted portfolio <strong>${code}</strong> for <strong>UGX ${amountFmt}</strong>.</p>
              <p>Approve in Partner Operations → Partner Management.</p>
            </div>`,
            partner_name: partnerName,
          },
        },
      });
    } catch (e) { console.warn("[submit-portfolio-completion] Ops email failed:", (e as Error)?.message); }

    return json({ success: true, portfolio_id: completed }, 200);
  } catch (e) {
    console.error("[submit-portfolio-completion] Fatal:", (e as Error)?.message, (e as Error)?.stack);
    return json({ error: (e as Error)?.message || "Unexpected server error" }, 500);
  }
});