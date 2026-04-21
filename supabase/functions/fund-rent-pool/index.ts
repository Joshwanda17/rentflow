import { createClient } from "npm:@supabase/supabase-js@2";
import { runShadowAudit } from "../_shared/shadowLogger.ts";
import { shadowValidatePoolFunding } from "../_shared/shadowValidation.ts";
import { fetchShadowConfig, shouldSample } from "../_shared/shadowConfig.ts";
import { buildPartnershipEmailRequest } from "./partnership-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch shadow config once (cached 60s)
  const shadowConfig = await fetchShadowConfig(adminClient);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enforce supporter role
    const { data: userRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .or("enabled.is.null,enabled.eq.true");

    const roles = (userRoles || []).map((r: any) => r.role);
    if (!roles.includes("supporter")) {
      if (shouldSample(shadowConfig)) {
        runShadowAudit('fund-rent-pool', { userId: user.id }, false,
          () => shadowValidatePoolFunding({ amount: 0, callerRoles: roles }), adminClient);
      }
      return new Response(
        JSON.stringify({ error: "Only supporter accounts can fund rent requests. Please use a dedicated supporter account." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { amount, summary_id } = await req.json() as {
      amount: number;
      summary_id: string;
    };

    if (!amount || amount <= 0) {
      if (shouldSample(shadowConfig)) {
        runShadowAudit('fund-rent-pool', { amount, userId: user.id }, false,
          () => shadowValidatePoolFunding({ amount, callerRoles: roles }), adminClient);
      }
      return new Response(
        JSON.stringify({ error: "Invalid amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Phase 5: Shadow audit on success path — sampled
    if (shouldSample(shadowConfig)) {
      runShadowAudit('fund-rent-pool', { amount, userId: user.id },
        true, () => shadowValidatePoolFunding({ amount, callerRoles: roles }), adminClient);
    }

    const payout_day = new Date().getDate();

    // Check wallet balance with optimistic locking
    const { data: wallet, error: walletErr } = await adminClient
      .from("wallets")
      .select("id, balance")
      .eq("user_id", user.id)
      .single();

    if (walletErr || !wallet) {
      return new Response(
        JSON.stringify({ error: "Wallet not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (wallet.balance < amount) {
      return new Response(
        JSON.stringify({ error: "Insufficient balance" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate reference ID
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const seq = String(Math.floor(1000 + Math.random() * 9000));
    const referenceId = `WRF${yy}${mm}${dd}${seq}`;

    // Calculate first payout date: strict 30-day cycle from investment date
    const firstPayoutMs = now.getTime() + 30 * 24 * 60 * 60 * 1000;
    const candidate = new Date(firstPayoutMs);
    const firstPayoutDate = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}-${String(candidate.getDate()).padStart(2, "0")}`;

    // Reduce the opportunity summary
    if (summary_id) {
      const { error: summaryErr } = await adminClient.rpc('decrement_rent_requested', {
        p_summary_id: summary_id,
        p_amount: amount,
      });
      if (summaryErr) {
        console.error("[fund-rent-pool] Failed to decrement opportunity summary:", summaryErr.message);
      }
    }

    // Record in general_ledger
    const txGroupId = crypto.randomUUID();
    const { error: ledgerErr } = await adminClient.rpc('create_ledger_transaction', {
      entries: [
        {
          user_id: user.id,
          amount,
          direction: "cash_out",
          category: "partner_funding",
          source_table: "opportunity_summaries",
          source_id: summary_id,
          description: `Supporter rent funding: UGX ${amount.toLocaleString()} to Rent Management Pool. Payout day: ${payout_day}th. First payout: ${firstPayoutDate}`,
          currency: 'UGX',
          reference_id: referenceId,
          linked_party: "Rent Management Pool",
          ledger_scope: "wallet",
          transaction_date: new Date().toISOString(),
        },
        {
          user_id: user.id,
          amount,
          direction: "cash_in",
          category: "partner_funding",
          source_table: "opportunity_summaries",
          source_id: summary_id,
          description: `Supporter capital received: UGX ${amount.toLocaleString()} into Rent Management Pool`,
          currency: 'UGX',
          reference_id: referenceId,
          linked_party: user.id,
          ledger_scope: "platform",
          transaction_date: new Date().toISOString(),
        },
      ],
    });

    if (ledgerErr) {
      console.error("[fund-rent-pool] Ledger insert failed:", ledgerErr.message);
      return new Response(
        JSON.stringify({ error: "Transaction failed. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create investor_portfolios record
    const portfolioCode = `WPF-${String(Math.floor(1000 + Math.random() * 9000))}`;
    const maturityDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    const maturityStr = `${maturityDate.getFullYear()}-${String(maturityDate.getMonth() + 1).padStart(2, "0")}-${String(maturityDate.getDate()).padStart(2, "0")}`;

    const { data: existingPortfolio } = await adminClient
      .from("investor_portfolios")
      .select("agent_id")
      .eq("investor_id", user.id)
      .limit(1)
      .maybeSingle();

    const agentId = existingPortfolio?.agent_id ?? user.id;

    const { data: insertedPortfolio, error: portfolioErr } = await adminClient.from("investor_portfolios").insert({
      investor_id: user.id,
      agent_id: agentId,
      investment_amount: amount,
      portfolio_code: portfolioCode,
      portfolio_pin: String(Math.floor(1000 + Math.random() * 9000)),
      activation_token: crypto.randomUUID(),
      roi_percentage: 15,
      roi_mode: "monthly_payout",
      duration_months: 12,
      status: "active",
      next_roi_date: firstPayoutDate,
      maturity_date: maturityStr,
      total_roi_earned: 0,
    }).select("id").maybeSingle();

    if (portfolioErr) {
      console.error("[fund-rent-pool] Portfolio creation failed:", portfolioErr.message);
    }

    const portfolioCreatedThisRun = !portfolioErr && !!insertedPortfolio?.id;
    const newPortfolioId = insertedPortfolio?.id ?? referenceId;

    // Read updated balance after trigger
    const { data: updatedWallet } = await adminClient
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .single();
    const newBalance = updatedWallet?.balance ?? (wallet.balance - amount);

    // Notify user
    const monthlyReward = Math.round(amount * 0.15);
    await adminClient.from("notifications").insert({
      user_id: user.id,
      title: "🎉 Thank You for Your Support!",
      message: `We truly appreciate your contribution of UGX ${amount.toLocaleString()} — it makes a real difference for tenants in need.\n\n⏳ Your investment will begin working for at least 30 days before your first reward.\n\n💰 You'll earn 15% (UGX ${monthlyReward.toLocaleString()}) monthly on the ${payout_day}${getOrdinalSuffix(payout_day)} of every month for 12 months, starting ${firstPayoutDate}.\n\nRef: ${referenceId}\n\n📋 To withdraw your investment, submit a 90-day notice request from your dashboard.`,
      type: "success",
      metadata: {
        amount,
        reference_id: referenceId,
        payout_day: payout_day,
        monthly_reward: monthlyReward,
        first_payout_date: firstPayoutDate,
        total_reward_12_months: monthlyReward * 12,
      },
    });

    console.log(`[fund-rent-pool] User ${user.id} funded ${amount} to rent pool. Payout day: ${payout_day}. Ref: ${referenceId}. TxGroup: ${txGroupId}`);


    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ title: "🏦 Rent Pool Funded", body: "Activity: rent pool funded", url: "/manager" }),
    }).catch(() => {});

    // Push notification to supporter (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({
        userIds: [user.id],
        payload: { title: "✅ Rent Pool Funded", body: `UGX ${amount.toLocaleString()} successfully funded to rent pool`, url: "/dashboard", type: "success" },
      }),
    }).catch(() => {});

    // Partnership Agreement email — sent on every NEW portfolio creation (fire-and-forget)
    if (portfolioCreatedThisRun) {
      try {
        const { data: profile } = await adminClient
          .from("profiles")
          .select("email, full_name")
          .eq("id", user.id)
          .maybeSingle();

        const emailRequest = buildPartnershipEmailRequest({
          portfolioCreatedThisRun,
          recipientEmail: profile?.email,
          userId: user.id,
          newPortfolioId: String(newPortfolioId),
          partnerName: profile?.full_name,
          amount,
          monthlyReward,
          contributionDateIso: now.toISOString(),
          firstPayoutDateIso: firstPayoutDate,
          payoutDay: payout_day,
        });

        if (emailRequest) {
          fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify(emailRequest),
          }).catch((err) => console.warn("[fund-rent-pool] Partnership agreement email enqueue failed:", err));
        }
      } catch (emailErr) {
        console.warn("[fund-rent-pool] Partnership agreement email lookup failed (non-blocking):", emailErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        reference_id: referenceId,
        new_balance: newBalance,
        payout_day,
        first_payout_date: firstPayoutDate,
        monthly_reward: monthlyReward,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[fund-rent-pool] Error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getOrdinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}
