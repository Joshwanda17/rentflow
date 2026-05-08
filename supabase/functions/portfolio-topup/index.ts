import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logSystemEvent } from "../_shared/eventLogger.ts";
import { checkTreasuryGuard } from "../_shared/treasuryGuard.ts";

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

    // Treasury guard: portfolio top-ups move money — block when paused
    const guardBlock = await checkTreasuryGuard(supabase, "any", req.headers.get("Authorization"));
    if (guardBlock) return guardBlock;

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
    const now = new Date().toISOString();

    // 1. Record the operation as `approved` — wallet-funded top-ups skip
    //    Financial Ops verification (funds already on-platform), but the
    //    principal is NOT applied instantly. The merge-pending-topups cron
    //    picks up `approved` rows and merges them into investment_amount
    //    on the portfolio's next payout date. Until then the partner sees
    //    a "Pending — applies on next payout" banner on the portfolio.
    const { error: pendingErr } = await supabase.from("pending_wallet_operations").insert({
      user_id: user.id,
      amount: topupAmount,
      direction: "cash_in",
      category: "pending_portfolio_topup",
      source_table: "investor_portfolios",
      source_id: portfolio_id,
      transaction_group_id: txGroupId,
      description: `Wallet-funded top-up for ${accountLabel} — applies on next payout`,
      linked_party: "platform",
      // `approved` — skips FinOps queue, eligible for merge-pending-topups
      // engine on the next payout date.
      status: "approved",
      reviewed_at: now,
      reviewed_by: user.id,
      operation_type: "portfolio_topup",
    });

    if (pendingErr) {
      return new Response(JSON.stringify({ error: "Failed to record pending top-up." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Record ledger entry via RPC — the sync_wallet_from_ledger trigger handles wallet deduction
    const { error: ledgerErr } = await supabase.rpc('create_ledger_transaction', {
      entries: [
        {
          user_id: user.id,
          amount: topupAmount,
          direction: "cash_out",
          category: "partner_funding",
          source_table: "investor_portfolios",
          source_id: portfolio_id,
          description: `Pending portfolio top-up: ${accountLabel}`,
          currency: 'UGX',
          ledger_scope: "wallet",
          transaction_date: now,
        },
        {
          user_id: user.id,
          amount: topupAmount,
          direction: "cash_in",
          category: "partner_funding",
          source_table: "investor_portfolios",
          source_id: portfolio_id,
          description: `Pending capital for ${accountLabel} — applied at maturity`,
          currency: 'UGX',
          ledger_scope: "platform",
          transaction_date: now,
        },
      ],
    });

    if (ledgerErr) {
      console.error("[portfolio-topup] Ledger RPC failed:", ledgerErr);
      return new Response(JSON.stringify({ error: "Failed to record ledger entry" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Post-ledger verification: ensure wallet didn't go negative (race condition guard)
    const { data: postWallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .single();

    if (postWallet && Number(postWallet.balance) < 0) {
      // Race condition: rollback via RPC
      await supabase.rpc('create_ledger_transaction', {
        entries: [
          {
            user_id: user.id,
            amount: topupAmount,
            direction: "cash_in",
            category: "system_balance_correction",
            source_table: "investor_portfolios",
            source_id: portfolio_id,
            description: `Reversal: insufficient balance for ${accountLabel} top-up`,
            currency: 'UGX',
            ledger_scope: "wallet",
            transaction_date: new Date().toISOString(),
          },
          {
            user_id: user.id,
            amount: topupAmount,
            direction: "cash_out",
            category: "system_balance_correction",
            source_table: "investor_portfolios",
            source_id: portfolio_id,
            description: `Reversal: platform return for failed ${accountLabel} top-up`,
            currency: 'UGX',
            ledger_scope: "platform",
            transaction_date: new Date().toISOString(),
          },
        ],
      });

      // Cancel pending op
      await supabase.from("pending_wallet_operations")
        .update({ status: "cancelled" })
        .eq("transaction_group_id", txGroupId);

      return new Response(JSON.stringify({ error: "Insufficient wallet balance" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. DO NOT bump investment_amount here. The top-up is parked in
    //    pending_wallet_operations (status=approved) and the
    //    merge-pending-topups cron applies it to the portfolio principal
    //    on the next payout date. Until then UI shows pending banner.
    console.log(`[portfolio-topup] User ${user.id} parked wallet-funded top-up of ${topupAmount} for ${portfolio_id} — merges on next payout`);

    // Log system event
    logSystemEvent(supabase, 'portfolio_topup', user.id, 'investor_portfolios', portfolio_id, { amount: topupAmount, portfolio_code: portfolio.portfolio_code });


    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ title: "📊 Portfolio Top-Up", body: "Activity: portfolio top-up", url: "/dashboard/manager" }),
    }).catch(() => {});

    // Push notification to partner (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({
        userIds: [user.id],
        payload: { title: "✅ Portfolio Top-Up Confirmed", body: `UGX ${topupAmount.toLocaleString()} portfolio top-up submitted`, url: "/dashboard/funder", type: "success" },
      }),
    }).catch(() => {});


    // Partnership Top-Up Confirmation email (fire-and-forget)
    // Sent on every successful self-service top-up: existing partner adding funds
    // to an existing portfolio. Distinct from the partnership-agreement email,
    // which fires only on brand-new portfolio creation in fund-rent-pool.
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.email) {
        const previousPortfolioValue = Number(portfolio.investment_amount) || 0;
        const newTotalPartnershipValue = previousPortfolioValue + topupAmount;

        const emailRequest = {
          templateName: "partnership-topup",
          recipientEmail: profile.email,
          idempotencyKey: `partnership-topup-${user.id}-${txGroupId}`,
          templateData: {
            partner_name: profile.full_name || "Partner",
            topup_amount: topupAmount,
            previous_portfolio_value: previousPortfolioValue,
            new_total_partnership_value: newTotalPartnershipValue,
            currency: "UGX",
            company_name: "Welile",
            logo_url: "https://welilereceipts.com/welile-logo.png",
            unsubscribe_url: "https://welile.com/unsubscribe",
            dashboard_url: "https://welilereceipts.com/auth",
          },
        };

        fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify(emailRequest),
        }).catch((err) => console.warn("[portfolio-topup] Top-up email enqueue failed:", err));
      }
    } catch (emailErr) {
      console.warn("[portfolio-topup] Top-up email lookup failed (non-blocking):", emailErr);
    }

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
