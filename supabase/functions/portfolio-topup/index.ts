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

    const body = await req.json();
    const { portfolio_id, amount } = body;

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

    // Verify portfolio belongs to the user (investor_id or agent_id)
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

    if (portfolio.investor_id !== user.id && portfolio.agent_id !== user.id) {
      return new Response(JSON.stringify({ error: "You do not own this portfolio" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (portfolio.status === "cancelled") {
      return new Response(JSON.stringify({ error: "Cannot top up a cancelled portfolio" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user wallet with optimistic lock
    const { data: wallet, error: wErr } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .single();

    if (wErr || !wallet) {
      return new Response(JSON.stringify({ error: "Wallet not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentBalance = Number(wallet.balance);
    if (currentBalance < topupAmount) {
      return new Response(JSON.stringify({ error: "Insufficient wallet balance" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const txGroupId = crypto.randomUUID();
    const accountLabel = portfolio.account_name || portfolio.portfolio_code;

    // 1. Deduct from wallet (optimistic lock)
    const { error: deductErr } = await supabase
      .from("wallets")
      .update({ balance: currentBalance - topupAmount, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("balance", currentBalance);

    if (deductErr) {
      return new Response(JSON.stringify({ error: "Balance changed, please try again" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. DO NOT increase investment_amount directly — deposit is pending until maturity
    const now = new Date().toISOString();

    // Insert into pending_wallet_operations with operation_type = 'portfolio_topup'
    const { error: pendingErr } = await supabase.from("pending_wallet_operations").insert({
      user_id: user.id,
      amount: topupAmount,
      direction: "cash_out",
      category: "pending_portfolio_topup",
      source_table: "investor_portfolios",
      source_id: portfolio_id,
      transaction_group_id: txGroupId,
      description: `Pending top-up for ${accountLabel} — awaiting maturity`,
      linked_party: "platform",
      status: "pending",
      operation_type: "portfolio_topup",
    });

    if (pendingErr) {
      // Rollback wallet
      await supabase
        .from("wallets")
        .update({ balance: currentBalance, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);

      return new Response(JSON.stringify({ error: "Failed to record pending top-up. Wallet restored." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Record double-entry ledger
    await supabase.from("general_ledger").insert([
      {
        user_id: user.id,
        amount: topupAmount,
        direction: "debit",
        category: "pending_portfolio_topup",
        source_table: "investor_portfolios",
        source_id: portfolio_id,
        transaction_group_id: txGroupId,
        description: `Pending portfolio top-up: ${accountLabel}`,
        ledger_scope: "wallet",
        transaction_date: now,
      },
      {
        user_id: user.id,
        amount: topupAmount,
        direction: "credit",
        category: "pending_portfolio_topup",
        source_table: "investor_portfolios",
        source_id: portfolio_id,
        transaction_group_id: txGroupId,
        description: `Pending capital for ${accountLabel} — applied at maturity`,
        ledger_scope: "platform",
        transaction_date: now,
      },
    ]);

    // 4. Notify user
    await supabase.from("notifications").insert({
      user_id: user.id,
      title: "⏳ Portfolio Top-Up Pending",
      message: `UGX ${topupAmount.toLocaleString()} has been deducted from your wallet for "${accountLabel}". This deposit will be added to your portfolio at maturity.`,
      type: "info",
      metadata: { portfolio_id, amount: topupAmount, status: "pending" },
    });

    console.log(`[portfolio-topup] User ${user.id} created pending top-up for ${portfolio_id} with ${topupAmount}`);

    return new Response(JSON.stringify({
      success: true,
      amount: topupAmount,
      status: "pending",
      current_capital: Number(portfolio.investment_amount),
      portfolio_code: portfolio.portfolio_code,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[portfolio-topup] Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
