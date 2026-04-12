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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const { investor_id, amount, payment_method, investment_reference } = body as {
      investor_id?: string; amount?: number; payment_method?: string; investment_reference?: string;
    };

    if (!investor_id || typeof investor_id !== "string") {
      return new Response(JSON.stringify({ error: "investor_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!amount || typeof amount !== "number" || amount < PRICE_PER_SHARE) {
      return new Response(JSON.stringify({ error: `Minimum investment is UGX ${PRICE_PER_SHARE.toLocaleString()}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: agentRole } = await adminClient
      .from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "agent").maybeSingle();
    if (!agentRole) {
      return new Response(JSON.stringify({ error: "Only agents can use this function" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const shares = Math.floor(amount / PRICE_PER_SHARE);
    const actualAmount = shares * PRICE_PER_SHARE;
    const poolOwnershipPercent = (shares / TOTAL_SHARES) * 100;
    const companyOwnershipPercent = (shares / TOTAL_SHARES) * POOL_PERCENT;

    const { data: poolState } = await adminClient
      .from("angel_pool_investments").select("shares").eq("status", "confirmed");
    const totalSharesSold = (poolState || []).reduce((sum: number, r: any) => sum + r.shares, 0);
    if (totalSharesSold + shares > TOTAL_SHARES) {
      return new Response(JSON.stringify({ error: `Only ${TOTAL_SHARES - totalSharesSold} shares remaining` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: investorWallet } = await adminClient
      .from("wallets").select("id, balance").eq("user_id", investor_id).single();
    if (!investorWallet || investorWallet.balance < actualAmount) {
      return new Response(JSON.stringify({ error: `Insufficient investor wallet balance` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const seq = String(Math.floor(1000 + Math.random() * 9000));
    const referenceId = `ANG${yy}${mm}${dd}${seq}`;

    const txDate = new Date().toISOString();

    // 1. Investment: wallet cash_out + platform cash_in (share_capital)
    const { error: investRpcErr } = await adminClient.rpc('create_ledger_transaction', {
      entries: [
        {
          user_id: investor_id, ledger_scope: 'wallet', direction: 'cash_out',
          amount: actualAmount, category: 'share_capital',
          source_table: 'angel_pool_investments', source_id: investorWallet.id,
          description: `Angel Pool investment: ${shares} shares @ UGX ${PRICE_PER_SHARE.toLocaleString()}/share (via agent)`,
          currency: 'UGX', reference_id: referenceId, transaction_date: txDate,
        },
        {
          user_id: investor_id, ledger_scope: 'platform', direction: 'cash_in',
          amount: actualAmount, category: 'share_capital',
          source_table: 'angel_pool_investments', source_id: investorWallet.id,
          description: `Angel Pool share capital received via agent`,
          currency: 'UGX', reference_id: referenceId, transaction_date: txDate,
        },
      ],
    });
    if (investRpcErr) throw investRpcErr;

    // Insert investment record
    const { error: investErr } = await adminClient
      .from("angel_pool_investments")
      .insert({
        investor_id, amount: actualAmount, shares,
        pool_ownership_percent: poolOwnershipPercent,
        company_ownership_percent: companyOwnershipPercent,
        status: "confirmed", reference_id: referenceId,
        agent_id: user.id, payment_method: payment_method || null,
        investment_reference: investment_reference || null,
      });
    if (investErr) throw investErr;

    // 2. Agent commission: platform cash_out + wallet cash_in (agent_commission_earned)
    const commission = Math.floor(actualAmount * AGENT_COMMISSION_RATE);
    if (commission > 0) {
      const { error: commErr } = await adminClient.rpc('create_ledger_transaction', {
        entries: [
          {
            user_id: user.id, ledger_scope: 'platform', direction: 'cash_out',
            amount: commission, category: 'agent_commission_earned',
            source_table: 'angel_pool_investments', source_id: investorWallet.id,
            description: `Angel Pool agent commission expense (1%) for ${referenceId}`,
            currency: 'UGX', reference_id: referenceId, transaction_date: txDate,
          },
          {
            user_id: user.id, ledger_scope: 'wallet', direction: 'cash_in',
            amount: commission, category: 'agent_commission_earned',
            source_table: 'angel_pool_investments', source_id: investorWallet.id,
            description: `Angel Pool agent commission (1%) for ${referenceId}`,
            currency: 'UGX', reference_id: referenceId, transaction_date: txDate,
          },
        ],
      });
      if (commErr) console.error("Commission RPC error:", commErr);
    }

    const { data: updatedWallet } = await adminClient
      .from("wallets").select("balance").eq("user_id", investor_id).single();

    await logSystemEvent(adminClient, "agent_angel_pool_investment", user.id, "angel_pool_investments", referenceId, {
      investor_id, shares, amount: actualAmount, commission, reference_id: referenceId,
    });

    return new Response(JSON.stringify({
      success: true, reference_id: referenceId, shares, actual_amount: actualAmount,
      pool_ownership_percent: poolOwnershipPercent, company_ownership_percent: companyOwnershipPercent,
      commission, investor_new_balance: updatedWallet?.balance ?? 0,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("agent-angel-pool-invest error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
