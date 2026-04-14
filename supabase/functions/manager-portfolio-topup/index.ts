import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logSystemEvent } from "../_shared/eventLogger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonRes(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return jsonRes({ error: "Unauthorized" }, 401);

    // Verify caller role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const allowedRoles = ["coo", "manager", "cfo", "super_admin"];
    if (!(roles || []).some((r: any) => allowedRoles.includes(r.role))) {
      return jsonRes({ error: "Insufficient permissions" }, 403);
    }

    const body = await req.json();
    const { portfolio_id, amount, notes, payment_method, wallet_source, proxy_agent_id } = body;

    // Validate portfolio_id
    if (!portfolio_id || !UUID_RE.test(portfolio_id)) {
      return jsonRes({ error: "Invalid portfolio_id" }, 400);
    }

    // Only wallet-based top-ups are allowed
    if (payment_method !== "wallet") {
      return jsonRes({ error: "Only wallet-based top-ups are supported" }, 400);
    }

    // Validate wallet_source
    const validSources = ["partner_wallet", "proxy_agent_wallet"];
    const source = validSources.includes(wallet_source) ? wallet_source : "partner_wallet";

    // Validate amount
    const topupAmount = Number(amount);
    if (!topupAmount || topupAmount < 1000) {
      return jsonRes({ error: "Minimum top-up is UGX 1,000" }, 400);
    }
    if (topupAmount > 200_000_000_000) {
      return jsonRes({ error: "Amount exceeds maximum" }, 400);
    }

    const safeNotes = typeof notes === "string" ? notes.slice(0, 500) : "";

    // Fetch portfolio
    const { data: portfolio, error: pErr } = await supabase
      .from("investor_portfolios")
      .select("id, investor_id, agent_id, investment_amount, status, portfolio_code, account_name")
      .eq("id", portfolio_id)
      .single();

    if (pErr || !portfolio) return jsonRes({ error: "Portfolio not found" }, 404);

    if (portfolio.status === "cancelled") {
      return jsonRes({ error: "Cannot top up a cancelled portfolio" }, 400);
    }

    const partnerId = portfolio.investor_id || portfolio.agent_id;
    const txGroupId = crypto.randomUUID();
    const accountLabel = portfolio.account_name || portfolio.portfolio_code;
    const now = new Date().toISOString();

    // Determine whose wallet to deduct from
    let deductUserId = partnerId;
    let sourceLabel = "Partner Wallet";

    if (source === "proxy_agent_wallet") {
      if (!proxy_agent_id || !UUID_RE.test(proxy_agent_id)) {
        return jsonRes({ error: "Invalid proxy_agent_id" }, 400);
      }

      // Verify proxy assignment exists
      const { data: proxyAssignment } = await supabase
        .from("proxy_agent_assignments")
        .select("id, agent_id")
        .eq("agent_id", proxy_agent_id)
        .eq("beneficiary_id", partnerId)
        .eq("is_active", true)
        .maybeSingle();

      if (!proxyAssignment) {
        return jsonRes({ error: "No active proxy agent assignment found for this partner" }, 403);
      }

      deductUserId = proxy_agent_id;

      // Get proxy agent name for audit
      const { data: agentProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", proxy_agent_id)
        .maybeSingle();

      sourceLabel = `Proxy Agent (${agentProfile?.full_name || proxy_agent_id})`;
    }

    // Check wallet balance
    const { data: wallet, error: wErr } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", deductUserId)
      .single();

    if (wErr || !wallet) return jsonRes({ error: `${sourceLabel} wallet not found` }, 404);

    if (Number(wallet.balance) < topupAmount) {
      return jsonRes({ error: `Insufficient ${sourceLabel.toLowerCase()} balance. Available: UGX ${Number(wallet.balance).toLocaleString()}` }, 400);
    }

    // Record pending operation with full source tracking
    const { error: pendingErr } = await supabase.from("pending_wallet_operations").insert({
      user_id: deductUserId,
      amount: topupAmount,
      direction: "cash_in",
      category: "pending_portfolio_topup",
      source_table: "investor_portfolios",
      source_id: portfolio_id,
      transaction_group_id: txGroupId,
      description: `${sourceLabel} top-up for ${accountLabel} — initiated by executive`,
      linked_party: "platform",
      status: "pending",
      operation_type: "portfolio_topup",
      reference_id: null,
      account: "wallet",
      metadata: {
        payment_method: "wallet",
        wallet_source: source,
        deduct_from_user_id: deductUserId,
        partner_id: partnerId,
        proxy_agent_id: source === "proxy_agent_wallet" ? proxy_agent_id : null,
        initiated_by: user.id,
        portfolio_code: portfolio.portfolio_code,
        source_label: sourceLabel,
      },
    });

    if (pendingErr) {
      console.error("[manager-portfolio-topup] pending insert error:", pendingErr);
      return jsonRes({ error: "Failed to record pending top-up" }, 500);
    }

    // Audit trail with full source tracking
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action_type: "manager_portfolio_topup_pending",
      table_name: "investor_portfolios",
      record_id: portfolio_id,
      metadata: {
        partner_id: partnerId,
        amount: topupAmount,
        current_capital: Number(portfolio.investment_amount),
        payment_method: "wallet",
        wallet_source: source,
        deduct_from_user_id: deductUserId,
        proxy_agent_id: source === "proxy_agent_wallet" ? proxy_agent_id : null,
        source_label: sourceLabel,
        notes: safeNotes,
        status: "pending_verification",
      },
    });

    // System event for traceability
    await logSystemEvent(supabase, "portfolio_topup_submitted", user.id, "investor_portfolios", portfolio_id, {
      partner_id: partnerId,
      amount: topupAmount,
      wallet_source: source,
      deduct_from: deductUserId,
      source_label: sourceLabel,
      portfolio_code: portfolio.portfolio_code,
    });

    console.log(`[manager-portfolio-topup] ${user.id} submitted wallet top-up for ${portfolio_id} (partner: ${partnerId}, source: ${sourceLabel}, deduct: ${deductUserId}) amount ${topupAmount}`);

    // Push notification to partner (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({
        userIds: [partnerId],
        payload: { title: "💰 Portfolio Top-Up Submitted", body: `UGX ${topupAmount.toLocaleString()} top-up submitted for ${accountLabel} from ${sourceLabel}`, url: "/dashboard", type: "success" },
      }),
    }).catch(() => {});

    return jsonRes({
      success: true,
      amount: topupAmount,
      status: "pending",
      payment_method: "wallet",
      wallet_source: source,
      source_label: sourceLabel,
      current_capital: Number(portfolio.investment_amount),
      portfolio_code: portfolio.portfolio_code,
    }, 200);

  } catch (error) {
    console.error("[manager-portfolio-topup] Error:", error);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
