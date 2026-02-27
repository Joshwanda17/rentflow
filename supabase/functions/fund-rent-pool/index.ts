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

    const { amount, summary_id, payout_day } = await req.json() as {
      amount: number;
      summary_id: string;
      payout_day: number;
    };

    if (!amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!payout_day || payout_day < 1 || payout_day > 28) {
      return new Response(
        JSON.stringify({ error: "Payout day must be between 1 and 28" }),
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

    // Calculate first payout date: funds must work for at least 30 days
    // Find the next occurrence of payout_day that is at least 30 days from now
    let candidate = new Date(now.getFullYear(), now.getMonth(), payout_day);
    // Move to next month if candidate is in the past or today
    if (candidate <= now) {
      candidate = new Date(now.getFullYear(), now.getMonth() + 1, payout_day);
    }
    // Keep advancing month-by-month until at least 30 days from now
    const minPayoutDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    while (candidate < minPayoutDate) {
      candidate = new Date(candidate.getFullYear(), candidate.getMonth() + 1, payout_day);
    }
    const firstPayoutDate = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}-${String(payout_day).padStart(2, "0")}`;

    // Record in general_ledger
    await adminClient.from("general_ledger").insert({
      user_id: user.id,
      amount,
      direction: "cash_out",
      category: "supporter_rent_fund",
      source_table: "opportunity_summaries",
      source_id: summary_id,
      description: `Supporter rent funding: UGX ${amount.toLocaleString()} to Rent Management Pool. Payout day: ${payout_day}th. First payout: ${firstPayoutDate}`,
      reference_id: referenceId,
      linked_party: "Rent Management Pool",
    });

    // Notify user with 15% monthly reward info
    const monthlyReward = Math.round(amount * 0.15);
    await adminClient.from("notifications").insert({
      user_id: user.id,
      title: "🎉 Rent Pool Funded Successfully!",
      message: `UGX ${amount.toLocaleString()} transferred to the Rent Management Pool.\n\n💰 You will receive 15% (UGX ${monthlyReward.toLocaleString()}) monthly on the ${payout_day}${getOrdinalSuffix(payout_day)} of every month for 12 months, starting ${firstPayoutDate}.\n\nRef: ${referenceId}\n\n📋 To withdraw your investment, submit a 90-day notice request.`,
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

    console.log(`[fund-rent-pool] User ${user.id} funded ${amount} to rent pool. Payout day: ${payout_day}. Ref: ${referenceId}`);

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
