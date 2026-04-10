import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Verify caller role (COO, manager, super_admin)
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const allowedRoles = ["coo", "manager", "super_admin"];
    if (!(roles || []).some((r: any) => allowedRoles.includes(r.role))) {
      return jsonRes({ error: "Insufficient permissions" }, 403);
    }

    const body = await req.json();
    const { portfolio_id, amount, reason } = body;

    // Validate inputs
    if (!portfolio_id || !UUID_RE.test(portfolio_id)) {
      return jsonRes({ error: "Invalid portfolio_id" }, 400);
    }

    const topupAmount = Number(amount);
    if (!topupAmount || topupAmount < 1000) {
      return jsonRes({ error: "Minimum transfer is UGX 1,000" }, 400);
    }
    if (topupAmount > 200_000_000_000) {
      return jsonRes({ error: "Amount exceeds maximum" }, 400);
    }

    const safeReason = typeof reason === "string" ? reason.trim().slice(0, 500) : "";
    if (safeReason.length < 10) {
      return jsonRes({ error: "Reason must be at least 10 characters" }, 400);
    }

    // Fetch portfolio
    const { data: portfolio, error: pErr } = await supabase
      .from("investor_portfolios")
      .select("id, investor_id, agent_id, investment_amount, status, portfolio_code, account_name")
      .eq("id", portfolio_id)
      .single();

    if (pErr || !portfolio) return jsonRes({ error: "Portfolio not found" }, 404);

    if (portfolio.status === "cancelled") {
      return jsonRes({ error: "Cannot fund a cancelled portfolio" }, 400);
    }

    const partnerId = portfolio.investor_id || portfolio.agent_id;
    const accountLabel = portfolio.account_name || portfolio.portfolio_code;

    // Check partner wallet balance (read-only, trigger handles updates)
    const { data: wallet, error: wErr } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", partnerId)
      .single();

    if (wErr || !wallet) return jsonRes({ error: "Partner wallet not found" }, 404);

    const currentBalance = Number(wallet.balance);
    if (currentBalance < topupAmount) {
      return jsonRes({ error: `Insufficient wallet balance. Available: UGX ${currentBalance.toLocaleString()}` }, 400);
    }

    const txGroupId = crypto.randomUUID();
    const now = new Date().toISOString();

    // 2. Record pending top-up (applied at maturity)
    const { error: pendingErr } = await supabase.from("pending_wallet_operations").insert({
      user_id: partnerId,
      amount: topupAmount,
      direction: "cash_in",
      category: "pending_portfolio_topup",
      source_table: "investor_portfolios",
      source_id: portfolio_id,
      transaction_group_id: txGroupId,
      description: `Tenant Partnership Operations: wallet → ${accountLabel}`,
      linked_party: "platform",
      status: "pending",
      operation_type: "portfolio_topup",
      metadata: {
        initiated_by: user.id,
        initiated_by_role: "coo",
        source: "wallet",
        portfolio_code: portfolio.portfolio_code,
        reason: safeReason,
      },
    });

    if (pendingErr) {
      console.error("[coo-wallet-to-portfolio] pending insert error:", pendingErr);
      return jsonRes({ error: "Failed to record pending top-up." }, 500);
    }

    // 3. Double-entry ledger via RPC (trigger handles wallet balance)
    await supabase.rpc('create_ledger_transaction', {
      entries: [
        {
          user_id: partnerId,
          amount: topupAmount,
          direction: "cash_out",
          category: "partner_funding",
          source_table: "investor_portfolios",
          source_id: portfolio_id,
          description: `Wallet deduction for ${accountLabel} — Tenant Partnership Operations`,
          currency: 'UGX',
          ledger_scope: "wallet",
          transaction_date: new Date().toISOString(),
        },
        {
          user_id: partnerId,
          amount: topupAmount,
          direction: "cash_in",
          category: "partner_funding",
          source_table: "investor_portfolios",
          source_id: portfolio_id,
          description: `Pending capital for ${accountLabel} — applied at maturity`,
          currency: 'UGX',
          ledger_scope: "platform",
          transaction_date: new Date().toISOString(),
        },
      ],
    });

    // 4. Audit trail
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action_type: "coo_wallet_to_portfolio",
      table_name: "investor_portfolios",
      record_id: portfolio_id,
      metadata: {
        partner_id: partnerId,
        amount: topupAmount,
        current_capital: Number(portfolio.investment_amount),
        wallet_balance_before: currentBalance,
        wallet_balance_after: currentBalance - topupAmount,
        reason: safeReason,
      },
    });

    // 5. Notify partner
    await supabase.from("notifications").insert({
      user_id: partnerId,
      title: "💰 Wallet → Support Account Transfer",
      message: `UGX ${topupAmount.toLocaleString()} has been moved from your wallet to "${accountLabel}" by Tenant Partnership Operations. This deposit will be applied at maturity.`,
      type: "info",
      metadata: { portfolio_id, amount: topupAmount, status: "pending" },
    });

    // 6. Notify CFO + COO executives
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
              title: "📊 Wallet → Portfolio Transfer",
              message: `UGX ${topupAmount.toLocaleString()} moved from partner wallet to "${accountLabel}" (${portfolio.portfolio_code}) — pending verification.`,
              type: "info",
              metadata: { portfolio_id, amount: topupAmount, portfolio_code: portfolio.portfolio_code, initiated_by: user.id, source: "wallet" },
            }))
          );
        }
      }
    } catch (notifErr) {
      console.error("[coo-wallet-to-portfolio] Executive notification error (non-blocking):", notifErr);
    }

    console.log(`[coo-wallet-to-portfolio] COO ${user.id} moved ${topupAmount} from partner ${partnerId} wallet to portfolio ${portfolio_id}`);

    // Notify managers (fire-and-forget)
    const supabaseUrl2 = Deno.env.get("SUPABASE_URL")!;
    const serviceKey2 = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    fetch(`${supabaseUrl2}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey2}` },
      body: JSON.stringify({ title: "📊 COO Portfolio Transfer", body: `UGX ${topupAmount.toLocaleString()} wallet → portfolio for ${accountLabel} (${portfolio.portfolio_code})`, url: "/manager" }),
    }).catch(() => {});

    // Push notification to partner (fire-and-forget)
    fetch(`${supabaseUrl2}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey2}` },
      body: JSON.stringify({
        userIds: [partnerId],
        payload: { title: "💰 Wallet → Portfolio", body: `UGX ${topupAmount.toLocaleString()} moved to your portfolio`, url: "/dashboard", type: "success" },
      }),
    }).catch(() => {});

    return jsonRes({
      success: true,
      amount: topupAmount,
      status: "pending",
      current_capital: Number(portfolio.investment_amount),
      wallet_balance_after: currentBalance - topupAmount,
      portfolio_code: portfolio.portfolio_code,
    }, 200);

  } catch (error) {
    console.error("[coo-wallet-to-portfolio] Error:", error);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
