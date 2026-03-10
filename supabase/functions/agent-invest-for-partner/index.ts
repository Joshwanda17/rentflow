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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authenticate the calling agent
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: agent }, error: agentError } = await userClient.auth.getUser();
    if (agentError || !agent) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is an agent
    const { data: agentRole } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", agent.id)
      .eq("role", "agent")
      .maybeSingle();

    if (!agentRole) {
      return new Response(
        JSON.stringify({ error: "Only agents can invest on behalf of partners" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { partner_id, amount, summary_id, payout_day } = await req.json() as {
      partner_id: string;
      amount: number;
      summary_id: string;
      payout_day: number;
    };

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!partner_id || !uuidRegex.test(partner_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid partner ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!amount || amount <= 0 || amount < 50000) {
      return new Response(
        JSON.stringify({ error: "Minimum investment is UGX 50,000" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!payout_day || payout_day < 1 || payout_day > 28) {
      return new Response(
        JSON.stringify({ error: "Payout day must be between 1 and 28" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify partner is a supporter
    const { data: partnerRole } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", partner_id)
      .eq("role", "supporter")
      .maybeSingle();

    if (!partnerRole) {
      return new Response(
        JSON.stringify({ error: "Selected user is not a registered partner/supporter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check AGENT's wallet balance (agent pays, not partner)
    const { data: agentWallet, error: walletErr } = await adminClient
      .from("wallets")
      .select("id, balance")
      .eq("user_id", agent.id)
      .single();

    if (walletErr || !agentWallet) {
      return new Response(
        JSON.stringify({ error: "Agent wallet not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (agentWallet.balance < amount) {
      return new Response(
        JSON.stringify({ error: "Insufficient agent balance" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Optimistic lock: deduct from AGENT's wallet
    const newAgentBalance = agentWallet.balance - amount;
    const { error: deductErr, count: deductCount } = await adminClient
      .from("wallets")
      .update({ balance: newAgentBalance, updated_at: new Date().toISOString() })
      .eq("user_id", agent.id)
      .eq("balance", agentWallet.balance)
      .select('id', { count: 'exact', head: true });

    if (deductErr || !deductCount || deductCount === 0) {
      return new Response(
        JSON.stringify({ error: "Balance changed, please retry" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate reference ID
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const seq = String(Math.floor(1000 + Math.random() * 9000));
    const referenceId = `WPR${yy}${mm}${dd}${seq}`;

    // Calculate first payout date (min 30 days working period)
    let candidate = new Date(now.getFullYear(), now.getMonth(), payout_day);
    if (candidate <= now) {
      candidate = new Date(now.getFullYear(), now.getMonth() + 1, payout_day);
    }
    const minPayoutDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    while (candidate < minPayoutDate) {
      candidate = new Date(candidate.getFullYear(), candidate.getMonth() + 1, payout_day);
    }
    const firstPayoutDate = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}-${String(payout_day).padStart(2, "0")}`;

    // Decrement opportunity summary (total rent demand)
    if (summary_id) {
      const { error: summaryErr } = await adminClient.rpc('decrement_rent_requested', {
        p_summary_id: summary_id,
        p_amount: amount,
      });
      if (summaryErr) {
        console.error("[agent-invest-for-partner] Failed to decrement opportunity summary:", summaryErr.message);
      }
    }

    // Get profile names
    const [partnerProfileRes, agentProfileRes] = await Promise.all([
      adminClient.from("profiles").select("full_name").eq("id", partner_id).single(),
      adminClient.from("profiles").select("full_name").eq("id", agent.id).single(),
    ]);

    const partnerName = partnerProfileRes.data?.full_name || "Partner";
    const agentName = agentProfileRes.data?.full_name || "Agent";

    // Record in general_ledger — agent cash_out (agent funded the investment)
    await adminClient.from("general_ledger").insert({
      user_id: agent.id,
      amount,
      direction: "cash_out",
      category: "agent_proxy_investment",
      source_table: "opportunity_summaries",
      source_id: summary_id || null,
      description: `Agent proxy investment: UGX ${amount.toLocaleString()} to Rent Management Pool on behalf of ${partnerName}. Payout day: ${payout_day}${getOrdinalSuffix(payout_day)}. First payout: ${firstPayoutDate}`,
      reference_id: referenceId,
      linked_party: "Rent Management Pool",
    });

    // Notify the partner
    const monthlyReward = Math.round(amount * 0.15);
    await adminClient.from("notifications").insert({
      user_id: partner_id,
      title: "🎉 Thank You — A Contribution Was Made for You!",
      message: `Your agent ${agentName} invested UGX ${amount.toLocaleString()} on your behalf to help tenants access housing — thank you for your partnership!\n\n⏳ Your investment will begin working for at least 30 days before your first reward.\n\n💰 You'll earn 15% (UGX ${monthlyReward.toLocaleString()}) monthly on the ${payout_day}${getOrdinalSuffix(payout_day)} of every month for 12 months, starting ${firstPayoutDate}.\n\nRef: ${referenceId}`,
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
      },
    });

    // --- Agent 2% commission from the pool ---
    const commissionRate = 0.02;
    const commission = Math.round(amount * commissionRate);

    // Credit agent wallet (re-fetch for optimistic lock after deduction)
    const { data: freshAgentWallet } = await adminClient
      .from("wallets")
      .select("id, balance")
      .eq("user_id", agent.id)
      .single();

    let finalAgentBalance = newAgentBalance;
    if (freshAgentWallet) {
      const balanceAfterCommission = freshAgentWallet.balance + commission;
      const { error: commErr, count: commCount } = await adminClient
        .from("wallets")
        .update({ balance: balanceAfterCommission, updated_at: new Date().toISOString() })
        .eq("user_id", agent.id)
        .eq("balance", freshAgentWallet.balance)
        .select('id', { count: 'exact', head: true });
      if (!commErr && commCount && commCount > 0) {
        finalAgentBalance = balanceAfterCommission;
      }
    }

    // Record agent earning
    const commRefId = `WAC${yy}${mm}${dd}${String(Math.floor(1000 + Math.random() * 9000))}`;
    await adminClient.from("agent_earnings").insert({
      agent_id: agent.id,
      amount: commission,
      earning_type: "proxy_investment_commission",
      description: `2% commission (UGX ${commission.toLocaleString()}) for facilitating ${partnerName}'s UGX ${amount.toLocaleString()} investment`,
      source_user_id: partner_id,
    });

    // Record commission in general_ledger (pool expense)
    await adminClient.from("general_ledger").insert({
      user_id: agent.id,
      amount: commission,
      direction: "cash_in",
      category: "proxy_investment_commission",
      source_table: "agent_earnings",
      description: `2% proxy investment commission from pool for ${partnerName}'s UGX ${amount.toLocaleString()} investment`,
      reference_id: commRefId,
      linked_party: "Rent Management Pool",
    });

    // Notify the agent
    await adminClient.from("notifications").insert({
      user_id: agent.id,
      title: "✅ Partner Investment Completed",
      message: `You invested UGX ${amount.toLocaleString()} from your wallet on behalf of ${partnerName} into the Rent Management Pool.\n\n💰 You earned UGX ${commission.toLocaleString()} (2% commission) from the pool.\n\nRef: ${referenceId}`,
      type: "info",
      metadata: {
        amount,
        reference_id: referenceId,
        partner_id,
        partner_name: partnerName,
        commission,
        commission_ref: commRefId,
        new_balance: finalAgentBalance,
      },
    });

    // Look up activation token for this partner
    let activationToken: string | null = null;
    const { data: invite } = await adminClient
      .from("supporter_invites")
      .select("activation_token, status")
      .eq("activated_user_id", partner_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (invite && invite.status !== "activated") {
      activationToken = invite.activation_token;
    }

    console.log(`[agent-invest-for-partner] Agent ${agent.id} invested ${amount} (from own wallet) on behalf of partner ${partner_id}. Ref: ${referenceId}`);

    return new Response(
      JSON.stringify({
        success: true,
        reference_id: referenceId,
        new_balance: finalAgentBalance,
        payout_day,
        first_payout_date: firstPayoutDate,
        monthly_reward: monthlyReward,
        partner_name: partnerName,
        activation_token: activationToken,
        agent_name: agentName,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[agent-invest-for-partner] Error:", msg);
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
