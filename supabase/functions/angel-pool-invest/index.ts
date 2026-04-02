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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate caller
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
    const { amount } = body as { amount?: number };

    // Validate amount
    if (!amount || typeof amount !== "number" || amount < PRICE_PER_SHARE) {
      return new Response(
        JSON.stringify({ error: `Minimum investment is USh ${PRICE_PER_SHARE.toLocaleString()}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

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

    const totalSharesSold = (poolState || []).reduce((sum, r) => sum + r.shares, 0);
    if (totalSharesSold + shares > TOTAL_SHARES) {
      const remaining = TOTAL_SHARES - totalSharesSold;
      return new Response(
        JSON.stringify({ error: `Only ${remaining} shares remaining in the pool` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check wallet balance
    const { data: wallet } = await adminClient
      .from("wallets")
      .select("id, balance")
      .eq("user_id", user.id)
      .single();

    if (!wallet || wallet.balance < actualAmount) {
      return new Response(
        JSON.stringify({ error: `Insufficient wallet balance. You need USh ${actualAmount.toLocaleString()}` }),
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

    // Insert cash_out ledger entry (triggers sync_wallet_from_ledger)
    const { error: ledgerErr } = await adminClient.from("general_ledger").insert({
      user_id: user.id,
      amount: actualAmount,
      direction: "cash_out",
      category: "angel_pool_investment",
      source_table: "angel_pool_investments",
      source_id: wallet.id,
      description: `Angel Pool investment: ${shares} shares @ USh ${PRICE_PER_SHARE.toLocaleString()}/share`,
      reference_id: referenceId,
      linked_party: "Welile Angel Pool",
      transaction_group_id: txGroupId,
    });

    if (ledgerErr) throw ledgerErr;

    // Insert investment record
    const { error: investErr } = await adminClient
      .from("angel_pool_investments")
      .insert({
        investor_id: user.id,
        amount: actualAmount,
        shares,
        pool_ownership_percent: poolOwnershipPercent,
        company_ownership_percent: companyOwnershipPercent,
        status: "confirmed",
        transaction_group_id: txGroupId,
        reference_id: referenceId,
      });

    if (investErr) throw investErr;

    // Get updated balance
    const { data: updatedWallet } = await adminClient
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .single();

    // Log system event (event-driven)
    await logSystemEvent(adminClient, "angel_pool_investment", user.id, "angel_pool_investments", referenceId, {
      shares,
      amount: actualAmount,
      pool_ownership_percent: poolOwnershipPercent,
      company_ownership_percent: companyOwnershipPercent,
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
        new_balance: updatedWallet?.balance ?? 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("angel-pool-invest error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
