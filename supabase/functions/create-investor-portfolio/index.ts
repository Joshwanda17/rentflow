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
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Dual-client pattern for auth verification
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify role (agent, manager, coo, super_admin, operations)
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["agent", "manager", "coo", "super_admin", "operations"]);

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Only authorized roles can create investor portfolios" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate required fields
    const investmentAmount = typeof body.investment_amount === 'number' && Number.isFinite(body.investment_amount) ? body.investment_amount : null;
    const durationMonths = typeof body.duration_months === 'number' && [3, 6, 12].includes(body.duration_months) ? body.duration_months : null;
    const roiPercentage = typeof body.roi_percentage === 'number' && body.roi_percentage > 0 && body.roi_percentage <= 100 ? body.roi_percentage : 15;
    const roiMode = typeof body.roi_mode === 'string' && ['monthly_payout', 'monthly_compounding'].includes(body.roi_mode) ? body.roi_mode : 'monthly_payout';
    const portfolioPin = typeof body.portfolio_pin === 'string' && /^\d{4}$/.test(body.portfolio_pin) ? body.portfolio_pin : null;
    const inviteId = typeof body.invite_id === 'string' && body.invite_id.length > 0 ? body.invite_id : null;
    const investorId = typeof body.investor_id === 'string' && body.investor_id.length > 0 ? body.investor_id : null;
    const payoutDay = typeof body.payout_day === 'number' && body.payout_day >= 1 && body.payout_day <= 31 ? body.payout_day : 15;

    // Payment method fields
    const paymentMethod = typeof body.payment_method === 'string' && ['mobile_money', 'bank'].includes(body.payment_method) ? body.payment_method : null;
    const mobileNetwork = typeof body.mobile_network === 'string' && ['mtn', 'airtel'].includes(body.mobile_network) ? body.mobile_network : null;
    const mobileMoneyNumber = typeof body.mobile_money_number === 'string' ? body.mobile_money_number.trim().slice(0, 20) : null;
    const bankName = typeof body.bank_name === 'string' ? body.bank_name.trim().slice(0, 100) : null;
    const accountName = typeof body.account_name === 'string' ? body.account_name.trim().slice(0, 200) : null;
    const accountNumber = typeof body.account_number === 'string' ? body.account_number.trim().slice(0, 50) : null;

    if (!investmentAmount || investmentAmount < 50000) {
      return new Response(JSON.stringify({ error: "Investment amount must be at least UGX 50,000" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!durationMonths) {
      return new Response(JSON.stringify({ error: "Duration must be 3, 6, or 12 months" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!portfolioPin) {
      return new Response(JSON.stringify({ error: "A 4-digit portfolio PIN is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate portfolio code via DB function
    const { data: codeData, error: codeError } = await adminClient.rpc('generate_portfolio_code');
    if (codeError || !codeData) {
      console.error("Portfolio code generation error:", codeError);
      return new Response(JSON.stringify({ error: "Failed to generate portfolio code" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const maturityDate = new Date(now);
    maturityDate.setMonth(maturityDate.getMonth() + durationMonths);

    const nextRoiDate = new Date(now);
    nextRoiDate.setDate(nextRoiDate.getDate() + 30);

    const { data: portfolio, error: insertError } = await adminClient
      .from("investor_portfolios")
      .insert({
        investor_id: investorId,
        invite_id: inviteId,
        agent_id: user.id,
        portfolio_code: codeData,
        investment_amount: investmentAmount,
        duration_months: durationMonths,
        roi_percentage: roiPercentage,
        roi_mode: roiMode,
        payment_method: paymentMethod,
        mobile_network: mobileNetwork,
        mobile_money_number: mobileMoneyNumber,
        bank_name: bankName,
        account_name: accountName,
        account_number: accountNumber,
        portfolio_pin: portfolioPin,
        payout_day: payoutDay,
        maturity_date: maturityDate.toISOString().split('T')[0],
        next_roi_date: nextRoiDate.toISOString().split('T')[0],
        status: 'pending_approval', // Requires manager/COO approval before activation
      })
      .select()
      .single();

    if (insertError) {
      console.error("Portfolio insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create portfolio", details: insertError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Queue in pending_wallet_operations for manager/COO approval — NOT directly in ledger
    const txGroupId = crypto.randomUUID();
    const agentProfile = await adminClient.from("profiles").select("full_name").eq("id", user.id).single();
    const agentName = agentProfile.data?.full_name || "Agent";

    const { error: pendingErr } = await adminClient.from("pending_wallet_operations").insert({
      user_id: investorId || user.id,
      amount: investmentAmount,
      direction: "cash_in",
      category: "supporter_facilitation_capital",
      source_table: "investor_portfolios",
      source_id: portfolio.id,
      transaction_group_id: txGroupId,
      description: `Portfolio ${codeData} created by ${agentName}. UGX ${investmentAmount.toLocaleString()} investment pending approval.`,
      reference_id: codeData,
      linked_party: agentName,
      metadata: {
        agent_id: user.id,
        agent_name: agentName,
        portfolio_code: codeData,
        roi_percentage: roiPercentage,
        duration_months: durationMonths,
      },
    });

    if (pendingErr) {
      console.error("Pending wallet op insert failed:", pendingErr);
      // Cleanup portfolio
      await adminClient.from("investor_portfolios").delete().eq("id", portfolio.id);
      return new Response(JSON.stringify({ error: "Failed to queue for approval, portfolio rolled back." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Portfolio ${codeData} created (pending_approval): ${investmentAmount} UGX, ${durationMonths}mo, ${roiMode}. Queued for manager approval.`);

    return new Response(JSON.stringify({
      success: true,
      portfolio: {
        id: portfolio.id,
        portfolio_code: portfolio.portfolio_code,
        activation_token: portfolio.activation_token,
        investment_amount: portfolio.investment_amount,
        duration_months: portfolio.duration_months,
        roi_percentage: portfolio.roi_percentage,
        roi_mode: portfolio.roi_mode,
        maturity_date: portfolio.maturity_date,
        next_roi_date: portfolio.next_roi_date,
      },
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error creating portfolio:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
