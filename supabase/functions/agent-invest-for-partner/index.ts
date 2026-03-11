import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" };

function errorResponse(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: JSON_HEADERS });
}

function getOrdinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing authorization header", 401);

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: agent }, error: agentError } = await userClient.auth.getUser();
    if (agentError || !agent) return errorResponse("Unauthorized", 401);

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // --- Verify agent role ---
    const { data: agentRole } = await adminClient
      .from("user_roles").select("id")
      .eq("user_id", agent.id).eq("role", "agent").maybeSingle();
    if (!agentRole) return errorResponse("Only agents can invest on behalf of partners", 403);

    // --- Parse & validate inputs ---
    const { partner_id, amount, summary_id } = await req.json() as {
      partner_id: string;
      amount: number;
      summary_id: string;
    };

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!partner_id || !uuidRegex.test(partner_id)) return errorResponse("Invalid partner ID", 400);
    if (!amount || amount < 50000) return errorResponse("Minimum investment is UGX 50,000", 400);

    // --- Verify partner is a supporter ---
    const { data: partnerRole } = await adminClient
      .from("user_roles").select("id")
      .eq("user_id", partner_id).eq("role", "supporter").maybeSingle();
    if (!partnerRole) return errorResponse("Selected user is not a registered partner/supporter", 400);

    // --- Check agent wallet ---
    const { data: agentWallet, error: walletErr } = await adminClient
      .from("wallets").select("id, balance")
      .eq("user_id", agent.id).single();
    if (walletErr || !agentWallet) return errorResponse("Agent wallet not found", 404);
    if (agentWallet.balance < amount) return errorResponse("Insufficient agent balance", 400);

    // --- Deduct from agent wallet (optimistic lock) ---
    const newAgentBalance = agentWallet.balance - amount;
    const { data: deductResult, error: deductErr } = await adminClient
      .from("wallets")
      .update({ balance: newAgentBalance, updated_at: new Date().toISOString() })
      .eq("user_id", agent.id)
      .eq("balance", agentWallet.balance)
      .select("id")
      .maybeSingle();

    if (deductErr || !deductResult) return errorResponse("Balance changed, please retry", 409);

    // --- Generate IDs ---
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const seq = () => String(Math.floor(1000 + Math.random() * 9000));
    const referenceId = `WPR${yy}${mm}${dd}${seq()}`;
    const txGroupId = crypto.randomUUID();

    // Payout: strict 30-day cycle from investment date (default; COO can override later)
    const payout_day = now.getDate();
    const firstPayoutMs = now.getTime() + 30 * 24 * 60 * 60 * 1000;
    const candidate = new Date(firstPayoutMs);
    const firstPayoutDate = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}-${String(candidate.getDate()).padStart(2, "0")}`;

    // --- Helper: rollback agent wallet on failure ---
    const rollbackAgentWallet = async () => {
      console.error("[agent-invest-for-partner] Rolling back agent wallet deduction");
      await adminClient.from("wallets")
        .update({ balance: agentWallet.balance, updated_at: new Date().toISOString() })
        .eq("user_id", agent.id);
    };

    // --- Get profile names ---
    const [partnerProfileRes, agentProfileRes] = await Promise.all([
      adminClient.from("profiles").select("full_name").eq("id", partner_id).single(),
      adminClient.from("profiles").select("full_name").eq("id", agent.id).single(),
    ]);
    const partnerName = partnerProfileRes.data?.full_name || "Partner";
    const agentName = agentProfileRes.data?.full_name || "Agent";

    // --- Record agent cash_out in general_ledger (audit only, no txGroupId = no trigger) ---
    const { error: ledgerErr } = await adminClient.from("general_ledger").insert({
      user_id: agent.id,
      amount,
      direction: "cash_out",
      category: "agent_proxy_investment",
      source_table: "investor_portfolios",
      source_id: summary_id || null,
      description: `Agent proxy investment: UGX ${amount.toLocaleString()} to Rent Management Pool on behalf of ${partnerName}. Payout day: ${payout_day}${getOrdinalSuffix(payout_day)}. First payout: ${firstPayoutDate}`,
      reference_id: referenceId,
      linked_party: "Rent Management Pool",
    });

    if (ledgerErr) {
      await rollbackAgentWallet();
      return errorResponse("Failed to record transaction, wallet restored. Please retry.", 500);
    }

    // --- Decrement opportunity summary ---
    if (summary_id) {
      const { error: summaryErr } = await adminClient.rpc('decrement_rent_requested', {
        p_summary_id: summary_id,
        p_amount: amount,
      });
      if (summaryErr) {
        console.error("[agent-invest-for-partner] Failed to decrement opportunity summary:", summaryErr.message);
      }
    }

    // --- Look up supporter invite ---
    let inviteId: string | null = null;
    let activationToken: string | null = null;
    const { data: invite } = await adminClient
      .from("supporter_invites")
      .select("id, activation_token, status")
      .eq("activated_user_id", partner_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (invite) {
      inviteId = invite.id;
      if (invite.status !== "activated") {
        activationToken = invite.activation_token;
      }
    }

    // --- Create investor_portfolio ---
    let portfolioCode = `WIP${yy}${mm}${dd}${seq()}`;
    try {
      const { data: codeData } = await adminClient.rpc('generate_portfolio_code');
      if (codeData) portfolioCode = codeData;
    } catch {
      // fallback code already set
    }

    const portfolioPin = String(Math.floor(1000 + Math.random() * 9000));
    const maturityDate = new Date(now);
    maturityDate.setMonth(maturityDate.getMonth() + 12);

    const { data: portfolio, error: portfolioErr } = await adminClient
      .from("investor_portfolios")
      .insert({
        investor_id: partner_id,
        invite_id: inviteId,
        agent_id: agent.id,
        portfolio_code: portfolioCode,
        investment_amount: amount,
        duration_months: 12,
        roi_percentage: 15,
        roi_mode: "monthly_payout",
        portfolio_pin: portfolioPin,
        payout_day: null, // null = strict 30-day cycle (default); COO can override
        maturity_date: maturityDate.toISOString().split("T")[0],
        next_roi_date: firstPayoutDate,
        status: "pending_approval", // Portfolio stays inactive until COO/admin approves
      })
      .select("id")
      .single();

    if (portfolioErr) {
      console.error("[agent-invest-for-partner] Portfolio creation failed:", portfolioErr.message);
      await rollbackAgentWallet();
      // Clean up ledger entry
      await adminClient.from("general_ledger").delete().eq("reference_id", referenceId);
      return errorResponse("Failed to create portfolio, wallet restored. Please retry.", 500);
    }

    // --- Queue partner wallet credit in pending_wallet_operations (requires manager approval) ---
    const monthlyReward = Math.round(amount * 0.15);
    const { error: pendingErr } = await adminClient.from("pending_wallet_operations").insert({
      user_id: partner_id,
      amount,
      direction: "cash_in",
      category: "supporter_facilitation_capital",
      source_table: "investor_portfolios",
      source_id: portfolio.id,
      transaction_group_id: txGroupId,
      description: `Agent ${agentName} invested UGX ${amount.toLocaleString()} on behalf of ${partnerName} into Rent Management Pool`,
      reference_id: referenceId,
      linked_party: agentName,
      metadata: {
        proxy_agent_id: agent.id,
        proxy_agent_name: agentName,
        portfolio_id: portfolio.id,
        portfolio_code: portfolioCode,
        monthly_reward: monthlyReward,
        first_payout_date: firstPayoutDate,
      },
    });

    if (pendingErr) {
      console.error("[agent-invest-for-partner] pending_wallet_operations insert failed:", pendingErr.message);
      // Rollback: restore wallet, delete portfolio, delete ledger
      await rollbackAgentWallet();
      await adminClient.from("investor_portfolios").delete().eq("id", portfolio.id);
      await adminClient.from("general_ledger").delete().eq("reference_id", referenceId);
      return errorResponse("Failed to queue partner credit, all changes rolled back. Please retry.", 500);
    }

    // --- Agent 2% commission — queue for approval ---
    const commission = Math.round(amount * 0.02);
    const commRefId = `WAC${yy}${mm}${dd}${seq()}`;
    const commTxGroupId = crypto.randomUUID();

    // Record agent earning
    await adminClient.from("agent_earnings").insert({
      agent_id: agent.id,
      amount: commission,
      earning_type: "proxy_investment_commission",
      description: `2% commission (UGX ${commission.toLocaleString()}) for facilitating ${partnerName}'s UGX ${amount.toLocaleString()} investment`,
      source_user_id: partner_id,
    });

    // Queue commission credit for approval
    await adminClient.from("pending_wallet_operations").insert({
      user_id: agent.id,
      amount: commission,
      direction: "cash_in",
      category: "proxy_investment_commission",
      source_table: "agent_earnings",
      transaction_group_id: commTxGroupId,
      description: `2% proxy investment commission from pool for ${partnerName}'s UGX ${amount.toLocaleString()} investment`,
      reference_id: commRefId,
      linked_party: "Rent Management Pool",
    });

    // --- Notifications ---
    await Promise.all([
      // Notify partner
      adminClient.from("notifications").insert({
        user_id: partner_id,
        title: "🎉 Thank You — A Contribution Was Made for You!",
        message: `Your agent ${agentName} invested UGX ${amount.toLocaleString()} on your behalf to help tenants access housing — thank you for your partnership!\n\n⏳ Your investment will begin working for at least 30 days before your first reward.\n\n💰 You'll earn 15% (UGX ${monthlyReward.toLocaleString()}) monthly for 12 months, starting ${firstPayoutDate}.\n\nPortfolio: ${portfolioCode}\nRef: ${referenceId}`,
        type: "success",
        metadata: {
          amount,
          reference_id: referenceId,
          payout_day,
          monthly_reward: monthlyReward,
          first_payout_date: firstPayoutDate,
          total_reward_12_months: monthlyReward * 12,
          proxy_agent_id: agent.id,
          proxy_agent_name: agentName,
          portfolio_code: portfolioCode,
        },
      }),
      // Notify agent
      adminClient.from("notifications").insert({
        user_id: agent.id,
        title: "✅ Partner Investment Completed",
        message: `You invested UGX ${amount.toLocaleString()} from your wallet on behalf of ${partnerName} into the Rent Management Pool.\n\n💰 Your 2% commission (UGX ${commission.toLocaleString()}) is pending approval.\n\nPortfolio: ${portfolioCode}\nRef: ${referenceId}`,
        type: "info",
        metadata: {
          amount,
          reference_id: referenceId,
          partner_id,
          partner_name: partnerName,
          commission,
          commission_ref: commRefId,
          new_balance: newAgentBalance,
          portfolio_code: portfolioCode,
        },
      }),
    ]);

    console.log(`[agent-invest-for-partner] Agent ${agent.id} invested ${amount} for partner ${partner_id}. Portfolio: ${portfolioCode}. Ref: ${referenceId}. TxGroup: ${txGroupId}`);

    return new Response(
      JSON.stringify({
        success: true,
        reference_id: referenceId,
        new_balance: newAgentBalance,
        payout_day,
        first_payout_date: firstPayoutDate,
        monthly_reward: monthlyReward,
        partner_name: partnerName,
        activation_token: activationToken,
        agent_name: agentName,
        portfolio_code: portfolioCode,
      }),
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[agent-invest-for-partner] Error:", msg);
    return errorResponse(msg, 500);
  }
});
