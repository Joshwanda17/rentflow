import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_METHODS = ["cash", "mobile_money", "bank"] as const;
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
    const { portfolio_id, amount, notes, payment_method, transaction_reference } = body;

    // Validate portfolio_id
    if (!portfolio_id || !UUID_RE.test(portfolio_id)) {
      return jsonRes({ error: "Invalid portfolio_id" }, 400);
    }

    // Validate amount
    const topupAmount = Number(amount);
    if (!topupAmount || topupAmount < 1000) {
      return jsonRes({ error: "Minimum top-up is UGX 1,000" }, 400);
    }
    if (topupAmount > 200_000_000_000) {
      return jsonRes({ error: "Amount exceeds maximum" }, 400);
    }

    // Validate payment method
    if (!payment_method || !VALID_METHODS.includes(payment_method)) {
      return jsonRes({ error: "Invalid payment method. Use: cash, mobile_money, or bank" }, 400);
    }

    // Validate transaction reference for non-cash methods
    const safeRef = typeof transaction_reference === "string" ? transaction_reference.trim().slice(0, 50) : "";
    if (payment_method === "mobile_money" && safeRef.length < 8) {
      return jsonRes({ error: "Mobile Money TID must be at least 8 characters" }, 400);
    }
    if (payment_method === "bank" && safeRef.length < 6) {
      return jsonRes({ error: "Bank reference must be at least 6 characters" }, 400);
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

    const methodLabel = payment_method === "mobile_money" ? "Mobile Money" : payment_method === "bank" ? "Bank Transfer" : "Cash";
    const refLabel = safeRef ? ` (${payment_method === "mobile_money" ? "TID" : "Ref"}: ${safeRef})` : "";

    // 1. Record pending operation
    const { error: pendingErr } = await supabase.from("pending_wallet_operations").insert({
      user_id: partnerId,
      amount: topupAmount,
      direction: "cash_in",
      category: "pending_portfolio_topup",
      source_table: "investor_portfolios",
      source_id: portfolio_id,
      transaction_group_id: txGroupId,
      description: `Pending ${methodLabel} top-up for ${accountLabel}${refLabel}`,
      linked_party: "platform",
      status: "pending",
      operation_type: "portfolio_topup",
      reference_id: safeRef || null,
      account: payment_method,
      metadata: {
        payment_method,
        transaction_reference: safeRef || null,
        initiated_by: user.id,
        portfolio_code: portfolio.portfolio_code,
      },
    });

    if (pendingErr) {
      console.error("[manager-portfolio-topup] pending insert error:", pendingErr);
      return jsonRes({ error: "Failed to record pending top-up" }, 500);
    }

    // 2. Ledger entries
    await supabase.from("general_ledger").insert([
      {
        user_id: partnerId,
        amount: topupAmount,
        direction: "debit",
        category: "pending_portfolio_topup",
        source_table: "investor_portfolios",
        source_id: portfolio_id,
        transaction_group_id: txGroupId,
        description: `Pending ${methodLabel} top-up for ${accountLabel}${refLabel}`,
        ledger_scope: "wallet",
        transaction_date: now,
      },
      {
        user_id: partnerId,
        amount: topupAmount,
        direction: "credit",
        category: "pending_portfolio_topup",
        source_table: "investor_portfolios",
        source_id: portfolio_id,
        transaction_group_id: txGroupId,
        description: `Pending capital via ${methodLabel} for ${accountLabel}`,
        ledger_scope: "platform",
        transaction_date: now,
      },
    ]);

    // 3. Audit trail
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action_type: "manager_portfolio_topup_pending",
      table_name: "investor_portfolios",
      record_id: portfolio_id,
      metadata: {
        partner_id: partnerId,
        amount: topupAmount,
        current_capital: Number(portfolio.investment_amount),
        payment_method,
        transaction_reference: safeRef || null,
        notes: safeNotes,
        status: "pending_verification",
      },
    });

    // 4. Notify partner
    await supabase.from("notifications").insert({
      user_id: partnerId,
      title: "⏳ Portfolio Top-Up Pending",
      message: `UGX ${topupAmount.toLocaleString()} ${methodLabel} top-up submitted for "${accountLabel}".${refLabel} Awaiting verification.`,
      type: "info",
      metadata: { portfolio_id, amount: topupAmount, payment_method, status: "pending", initiated_by: user.id },
    });

    // 5. Notify CFO + COO executives
    try {
      const { data: execs } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["cfo", "coo"])
        .eq("enabled", true);
      if (execs && execs.length > 0) {
        const uniqueIds = [...new Set(execs.map((e: any) => e.user_id).filter((id: string) => id !== user.id))];
        if (uniqueIds.length > 0) {
          await supabase.from("notifications").insert(
            uniqueIds.map((uid: string) => ({
              user_id: uid,
              title: "📊 Portfolio Top-Up Submitted",
              message: `UGX ${topupAmount.toLocaleString()} ${methodLabel} top-up for "${accountLabel}" (${portfolio.portfolio_code})${refLabel} — pending verification.`,
              type: "info",
              metadata: { portfolio_id, amount: topupAmount, payment_method, portfolio_code: portfolio.portfolio_code, initiated_by: user.id },
            }))
          );
        }
      }
    } catch (notifErr) {
      console.error("[manager-portfolio-topup] Executive notification error (non-blocking):", notifErr);
    }

    console.log(`[manager-portfolio-topup] Manager ${user.id} submitted ${methodLabel} top-up for ${portfolio_id} (partner: ${partnerId}) amount ${topupAmount}${refLabel}`);

    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ title: "📊 Manager Portfolio Top-Up", body: `UGX ${topupAmount.toLocaleString()} top-up for ${accountLabel} (${portfolio.portfolio_code})`, url: "/manager" }),
    }).catch(() => {});

    return jsonRes({
      success: true,
      amount: topupAmount,
      status: "pending",
      payment_method,
      current_capital: Number(portfolio.investment_amount),
      portfolio_code: portfolio.portfolio_code,
    }, 200);

  } catch (error) {
    console.error("[manager-portfolio-topup] Error:", error);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
