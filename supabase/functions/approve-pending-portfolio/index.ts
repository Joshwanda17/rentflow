// Partner Ops → approves a portfolio that was completed by the partner.
// Flips 'pending_ops_approval' → 'active' and dispatches the standard
// partnership-agreement email (existing template) so the partner receives
// their final signed portfolio confirmation.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildPartnershipAgreementRequest, dispatchTransactionalEmail } from "../_shared/partnership-emails.ts";

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
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !caller) return json({ error: "Unauthorized" }, 401);

    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

    const portfolioId = String(body?.portfolio_id || "");
    if (!UUID.test(portfolioId)) return json({ error: "Invalid portfolio ID" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // RPC enforces the Ops-role gate + status transition atomically.
    const { error: rpcErr } = await userClient.rpc("approve_pending_portfolio", {
      p_portfolio_id: portfolioId,
    });
    if (rpcErr) {
      const msg = rpcErr.message || "";
      if (msg.includes("NOT_AUTHORIZED")) return json({ error: "Only Partner Operations can approve portfolios." }, 403);
      if (msg.includes("INVALID_STATUS")) return json({ error: "This portfolio is not awaiting approval." }, 409);
      if (msg.includes("PORTFOLIO_NOT_FOUND")) return json({ error: "Portfolio not found." }, 404);
      return json({ error: `Could not approve portfolio: ${msg}` }, 500);
    }

    // Fetch portfolio + partner for the final email.
    const { data: portfolio, error: pErr } = await admin
      .from("investor_portfolios")
      .select("id, investor_id, investment_amount, roi_percentage, roi_mode, duration_months, payout_day, portfolio_code, next_roi_date, created_at")
      .eq("id", portfolioId).maybeSingle();
    if (pErr || !portfolio) {
      console.warn("[approve-pending-portfolio] Portfolio lookup after approval failed:", pErr?.message);
      return json({ success: true, portfolio_id: portfolioId }, 200);
    }

    const { data: partner } = await admin
      .from("profiles").select("full_name, email").eq("id", portfolio.investor_id).maybeSingle();

    if (partner?.email) {
      const monthlyReward = Math.round(Number(portfolio.investment_amount) * (Number(portfolio.roi_percentage) / 100));
      try {
        await dispatchTransactionalEmail(
          supabaseUrl,
          serviceKey,
          buildPartnershipAgreementRequest({
            recipientEmail: partner.email,
            partnerName: partner.full_name,
            partnerId: portfolio.investor_id,
            portfolioId: portfolio.id,
            amount: Number(portfolio.investment_amount),
            monthlyReward,
            contributionDateIso: portfolio.created_at,
            firstPayoutDateIso: portfolio.next_roi_date || portfolio.created_at,
            payoutDay: portfolio.payout_day || 15,
            roiPercentage: Number(portfolio.roi_percentage),
          }),
        );
      } catch (e) {
        console.warn("[approve-pending-portfolio] Agreement email failed:", (e as Error)?.message);
      }
    }

    return json({ success: true, portfolio_id: portfolioId }, 200);
  } catch (e) {
    console.error("[approve-pending-portfolio] Fatal:", (e as Error)?.message);
    return json({ error: (e as Error)?.message || "Unexpected server error" }, 500);
  }
});