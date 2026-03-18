import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is COO or manager
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const allowedRoles = ["coo", "manager", "cfo", "super_admin"];
    const hasRole = (roles || []).some((r: any) => allowedRoles.includes(r.role));
    if (!hasRole) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { portfolio_id, amount, notes } = body;

    // Validate inputs
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!portfolio_id || !UUID_RE.test(portfolio_id)) {
      return new Response(JSON.stringify({ error: "Invalid portfolio_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const topupAmount = Number(amount);
    if (!topupAmount || topupAmount < 1000) {
      return new Response(JSON.stringify({ error: "Minimum top-up is UGX 1,000" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (topupAmount > 200_000_000_000) {
      return new Response(JSON.stringify({ error: "Amount exceeds maximum" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safeNotes = typeof notes === "string" ? notes.slice(0, 500) : "";

    // Fetch portfolio
    const { data: portfolio, error: pErr } = await supabase
      .from("investor_portfolios")
      .select("id, investor_id, agent_id, investment_amount, status, portfolio_code, account_name")
      .eq("id", portfolio_id)
      .single();

    if (pErr || !portfolio) {
      return new Response(JSON.stringify({ error: "Portfolio not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (portfolio.status === "cancelled") {
      return new Response(JSON.stringify({ error: "Cannot top up a cancelled portfolio" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The partner whose wallet we deduct from
    const partnerId = portfolio.investor_id || portfolio.agent_id;

    // Fetch partner wallet with optimistic lock
    const { data: wallet, error: wErr } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", partnerId)
      .single();

    if (wErr || !wallet) {
      return new Response(JSON.stringify({ error: "Partner wallet not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentBalance = Number(wallet.balance);
    if (currentBalance < topupAmount) {
      return new Response(JSON.stringify({ error: `Insufficient wallet balance. Partner has UGX ${currentBalance.toLocaleString()}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const txGroupId = crypto.randomUUID();
    const accountLabel = portfolio.account_name || portfolio.portfolio_code;
    const now = new Date().toISOString();

    // 1. Deduct from partner wallet (optimistic lock)
    const { data: deductResult, error: deductErr } = await supabase
      .from("wallets")
      .update({ balance: currentBalance - topupAmount, updated_at: now })
      .eq("user_id", partnerId)
      .eq("balance", currentBalance)
      .select("user_id");

    if (deductErr || !deductResult?.length) {
      return new Response(JSON.stringify({ error: "Balance changed concurrently, please retry" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Increase portfolio investment_amount
    const newInvestment = Number(portfolio.investment_amount) + topupAmount;
    const { error: topupErr } = await supabase
      .from("investor_portfolios")
      .update({ investment_amount: newInvestment })
      .eq("id", portfolio_id);

    if (topupErr) {
      // Rollback wallet
      await supabase
        .from("wallets")
        .update({ balance: currentBalance, updated_at: now })
        .eq("user_id", partnerId);

      return new Response(JSON.stringify({ error: "Failed to update portfolio. Wallet restored." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Double-entry ledger: Debit partner wallet, Credit platform (portfolio)
    await supabase.from("general_ledger").insert([
      {
        user_id: partnerId,
        amount: topupAmount,
        direction: "debit",
        category: "portfolio_topup",
        source_table: "investor_portfolios",
        source_id: portfolio_id,
        transaction_group_id: txGroupId,
        description: `Manager top-up to portfolio: ${accountLabel}`,
        ledger_scope: "wallet",
        transaction_date: now,
      },
      {
        user_id: partnerId,
        amount: topupAmount,
        direction: "credit",
        category: "portfolio_topup",
        source_table: "investor_portfolios",
        source_id: portfolio_id,
        transaction_group_id: txGroupId,
        description: `Capital added to ${accountLabel}`,
        ledger_scope: "platform",
        transaction_date: now,
      },
    ]);

    // 4. Audit trail with mandatory reason
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action_type: "manager_portfolio_topup",
      table_name: "investor_portfolios",
      record_id: portfolio_id,
      metadata: {
        partner_id: partnerId,
        amount: topupAmount,
        new_total: newInvestment,
        previous_balance: currentBalance,
        new_balance: currentBalance - topupAmount,
        notes: safeNotes,
      },
    });

    // 5. Notify partner
    await supabase.from("notifications").insert({
      user_id: partnerId,
      title: "✅ Portfolio Top-Up",
      message: `UGX ${topupAmount.toLocaleString()} has been moved from your wallet to "${accountLabel}". New capital: UGX ${newInvestment.toLocaleString()}.`,
      type: "success",
      metadata: { portfolio_id, amount: topupAmount, new_total: newInvestment, initiated_by: user.id },
    });

    console.log(`[manager-portfolio-topup] Manager ${user.id} topped up ${portfolio_id} (partner: ${partnerId}) with ${topupAmount}. New total: ${newInvestment}`);

    return new Response(JSON.stringify({
      success: true,
      amount: topupAmount,
      new_investment_total: newInvestment,
      new_wallet_balance: currentBalance - topupAmount,
      portfolio_code: portfolio.portfolio_code,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[manager-portfolio-topup] Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
