import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logSystemEvent } from "../_shared/eventLogger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOTAL_SHARES = 25_000;
const PRICE_PER_SHARE = 20_000;
const POOL_PERCENT = 8;
const AGENT_COMMISSION_RATE = 0.01;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate caller (agent)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { investor_id, amount, payment_method, investment_reference } = body as {
      investor_id?: string;
      amount?: number;
      payment_method?: string;
      investment_reference?: string;
    };

    // Validate inputs
    if (!investor_id || typeof investor_id !== "string") {
      return new Response(
        JSON.stringify({ error: "investor_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!amount || typeof amount !== "number" || amount < PRICE_PER_SHARE) {
      return new Response(
        JSON.stringify({ error: `Minimum investment is USh ${PRICE_PER_SHARE.toLocaleString()}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Verify caller is an agent
    const { data: agentRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "agent")
      .maybeSingle();

    if (!agentRole) {
      return new Response(
        JSON.stringify({ error: "Only agents can use this function" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate shares and ownership
    const shares = Math.floor(amount / PRICE_PER_SHARE);
    const actualAmount = shares * PRICE_PER_SHARE;
    const poolOwnershipPercent = (shares / TOTAL_SHARES) * 100;
    const companyOwnershipPercent = (shares / TOTAL_SHARES) * POOL_PERCENT;

    // Check pool capacity
    const { data: poolState } = await adminClient
      .from("angel_pool_investments")
      .select("shares")
      .eq("status", "confirmed");

    const totalSharesSold = (poolState || []).reduce((sum: number, r: any) => sum + r.shares, 0);
    if (totalSharesSold + shares > TOTAL_SHARES) {
      const remaining = TOTAL_SHARES - totalSharesSold;
      return new Response(
        JSON.stringify({ error: `Only ${remaining} shares remaining in the pool` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check investor wallet balance
    const { data: investorWallet } = await adminClient
      .from("wallets")
      .select("id, balance")
      .eq("user_id", investor_id)
      .single();

    if (!investorWallet || investorWallet.balance < actualAmount) {
      return new Response(
        JSON.stringify({ error: `Insufficient investor wallet balance. Need USh ${actualAmount.toLocaleString()}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate reference
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const seq = String(Math.floor(1000 + Math.random() * 9000));
    const referenceId = `ANG${yy}${mm}${dd}${seq}`;
    const txGroupId = crypto.randomUUID();

    // 1. Deduct from investor wallet (cash_out)
    const { error: ledgerErr } = await adminClient.from("general_ledger").insert({
      user_id: investor_id,
      amount: actualAmount,
      direction: "cash_out",
      category: "angel_pool_investment",
      source_table: "angel_pool_investments",
      source_id: investorWallet.id,
      description: `Angel Pool investment: ${shares} shares @ USh ${PRICE_PER_SHARE.toLocaleString()}/share (via agent)`,
      currency: "UGX",
      reference_id: referenceId,
      linked_party: "Welile Angel Pool",
      transaction_group_id: txGroupId,
    });

    if (ledgerErr) throw ledgerErr;

    // 2. Insert investment record with agent_id
    const { error: investErr } = await adminClient
      .from("angel_pool_investments")
      .insert({
        investor_id: investor_id,
        amount: actualAmount,
        shares,
        pool_ownership_percent: poolOwnershipPercent,
        company_ownership_percent: companyOwnershipPercent,
        status: "confirmed",
        transaction_group_id: txGroupId,
        reference_id: referenceId,
        agent_id: user.id,
        payment_method: payment_method || null,
        investment_reference: investment_reference || null,
      });

    if (investErr) throw investErr;

    // 3. Agent commission: 1% cash_in to agent wallet
    const commission = Math.floor(actualAmount * AGENT_COMMISSION_RATE);
    if (commission > 0) {
      const commissionTxGroup = crypto.randomUUID();

      const { error: commErr } = await adminClient.from("general_ledger").insert({
        user_id: user.id,
        amount: commission,
        direction: "cash_in",
        category: "angel_pool_commission",
        source_table: "angel_pool_investments",
        source_id: investorWallet.id,
        description: `Angel Pool agent commission (1%) for ${referenceId}`,
        currency: "UGX",
        reference_id: referenceId,
        linked_party: investor_id,
        transaction_group_id: commissionTxGroup,
      });

      if (commErr) console.error("Commission credit error:", commErr);

      // 4. Platform debit for commission
      const { error: platErr } = await adminClient.from("general_ledger").insert({
        user_id: user.id,
        amount: commission,
        direction: "cash_out",
        category: "marketing_expense",
        source_table: "angel_pool_investments",
        source_id: investorWallet.id,
        description: `Angel Pool agent commission expense for ${referenceId}`,
        currency: "UGX",
        reference_id: referenceId,
        linked_party: "platform",
        transaction_group_id: commissionTxGroup,
        ledger_scope: "platform",
      });

      if (platErr) console.error("Platform debit error:", platErr);
    }

    // Get updated investor wallet balance
    const { data: updatedWallet } = await adminClient
      .from("wallets")
      .select("balance")
      .eq("user_id", investor_id)
      .single();

    // Log system event
    await logSystemEvent(adminClient, "agent_angel_pool_investment", user.id, "angel_pool_investments", referenceId, {
      investor_id,
      shares,
      amount: actualAmount,
      pool_ownership_percent: poolOwnershipPercent,
      company_ownership_percent: companyOwnershipPercent,
      commission,
      payment_method: payment_method || "unknown",
      reference_id: referenceId,
    });

    return new Response(
      JSON.stringify({
        success: true,
        reference_id: referenceId,
        shares,
        actual_amount: actualAmount,
        pool_ownership_percent: poolOwnershipPercent,
        company_ownership_percent: companyOwnershipPercent,
        commission,
        investor_new_balance: updatedWallet?.balance ?? 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("agent-angel-pool-invest error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
