import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const { amount, summary_id } = await req.json() as { amount: number; summary_id: string };

    if (!amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

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

    // Optimistic lock: deduct only if balance matches
    const newBalance = wallet.balance - amount;
    const { error: deductErr, count } = await adminClient
      .from("wallets")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("balance", wallet.balance);

    if (deductErr || count === 0) {
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
    const referenceId = `WRF${yy}${mm}${dd}${seq}`;

    // Record in general_ledger
    await adminClient.from("general_ledger").insert({
      user_id: user.id,
      amount,
      direction: "cash_out",
      category: "supporter_rent_fund",
      source_table: "opportunity_summaries",
      source_id: summary_id,
      description: `Supporter rent funding: UGX ${amount.toLocaleString()} to Rent Management Pool`,
      reference_id: referenceId,
      linked_party: "Rent Management Pool",
    });

    // Notify user
    await adminClient.from("notifications").insert({
      user_id: user.id,
      title: "Rent Pool Funded ✅",
      message: `UGX ${amount.toLocaleString()} transferred to the Rent Management Pool. Ref: ${referenceId}`,
      type: "success",
      metadata: { amount, reference_id: referenceId },
    });

    console.log(`[fund-rent-pool] User ${user.id} funded ${amount} to rent pool. Ref: ${referenceId}`);

    return new Response(
      JSON.stringify({ success: true, reference_id: referenceId, new_balance: newBalance }),
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
