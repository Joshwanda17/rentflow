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
      return new Response(JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Authenticate calling user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerError } = await userClient.auth.getUser();
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is a manager (COO access)
    const { data: managerRole } = await adminClient
      .from("user_roles").select("id")
      .eq("user_id", caller.id).eq("role", "manager").maybeSingle();

    if (!managerRole) {
      return new Response(JSON.stringify({ error: "Only managers/COO can perform this action" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { partner_id, amount, payout_day } = await req.json() as {
      partner_id: string;
      amount: number;
      payout_day: number;
    };

    // Validate inputs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!partner_id || !uuidRegex.test(partner_id)) {
      return new Response(JSON.stringify({ error: "Invalid partner ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!amount || amount < 50000) {
      return new Response(JSON.stringify({ error: "Minimum investment is UGX 50,000" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!payout_day || payout_day < 1 || payout_day > 28) {
      return new Response(JSON.stringify({ error: "Payout day must be between 1 and 28" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify partner is a supporter
    const { data: partnerRole } = await adminClient
      .from("user_roles").select("id")
      .eq("user_id", partner_id).eq("role", "supporter").maybeSingle();

    if (!partnerRole) {
      return new Response(JSON.stringify({ error: "Selected user is not a registered partner/supporter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check PARTNER's wallet balance (partner pays from their own wallet)
    const { data: partnerWallet, error: walletErr } = await adminClient
      .from("wallets").select("id, balance")
      .eq("user_id", partner_id).single();

    if (walletErr || !partnerWallet) {
      return new Response(JSON.stringify({ error: "Partner wallet not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (partnerWallet.balance < amount) {
      return new Response(JSON.stringify({ error: `Insufficient partner balance. Available: UGX ${partnerWallet.balance.toLocaleString()}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Deduct from PARTNER's wallet using optimistic locking
    const { data: updatedWallet, error: deductErr } = await adminClient
      .from("wallets")
      .update({ balance: partnerWallet.balance - amount, updated_at: new Date().toISOString() })
      .eq("user_id", partner_id)
      .eq("balance", partnerWallet.balance)  // optimistic lock: ensure balance hasn't changed
      .select('id, balance')
      .maybeSingle();

    if (deductErr || !updatedWallet) {
      return new Response(JSON.stringify({ error: "Insufficient balance or concurrent update, please retry" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const newBalance = updatedWallet.balance;

    // Generate reference
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const seq = String(Math.floor(1000 + Math.random() * 9000));
    const referenceId = `WCI${yy}${mm}${dd}${seq}`;

    // Generate transaction_group_id for double-entry ledger integrity
    const txGroupId = crypto.randomUUID();

    // Calculate first payout date (min 30 days)
    let candidate = new Date(now.getFullYear(), now.getMonth(), payout_day);
    if (candidate <= now) candidate = new Date(now.getFullYear(), now.getMonth() + 1, payout_day);
    const minPayout = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    while (candidate < minPayout) candidate = new Date(candidate.getFullYear(), candidate.getMonth() + 1, payout_day);
    const firstPayoutDate = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}-${String(payout_day).padStart(2, "0")}`;

    // Get names
    const partnerProfileRes = await adminClient.from("profiles").select("full_name").eq("id", partner_id).single();
    const partnerName = partnerProfileRes.data?.full_name || "Partner";

    // Record DEBIT in general_ledger (partner cash_out → pool)
    const { error: ledgerErr } = await adminClient.from("general_ledger").insert({
      user_id: partner_id,
      amount,
      direction: "cash_out",
      category: "coo_proxy_investment",
      source_table: "wallets",
      transaction_group_id: txGroupId,
      description: `Welile Operations invested UGX ${amount.toLocaleString()} from ${partnerName}'s wallet into Rent Management Pool. Payout day: ${payout_day}${getOrdinalSuffix(payout_day)}. First payout: ${firstPayoutDate}`,
      reference_id: referenceId,
      linked_party: "Rent Management Pool",
    });

    if (ledgerErr) {
      // ROLLBACK: restore partner wallet balance
      console.error("[coo-invest-for-partner] Ledger insert failed, rolling back wallet:", ledgerErr.message);
      await adminClient.from("wallets")
        .update({ balance: partnerWallet.balance, updated_at: new Date().toISOString() })
        .eq("user_id", partner_id);
      return new Response(JSON.stringify({ error: "Failed to record transaction, wallet restored. Please retry." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Record CREDIT in general_ledger (pool receives capital)
    await adminClient.from("general_ledger").insert({
      user_id: null,
      amount,
      direction: "cash_in",
      category: "pool_capital_received",
      source_table: "wallets",
      transaction_group_id: txGroupId,
      description: `Rent Management Pool received UGX ${amount.toLocaleString()} from ${partnerName} (facilitated by Welile Operations)`,
      reference_id: referenceId,
      linked_party: partnerName,
    });

    const monthlyReward = Math.round(amount * 0.15);

    // Notify the partner
    await adminClient.from("notifications").insert({
      user_id: partner_id,
      title: "🎉 Thank You — An Investment Was Made for You!",
      message: `Great news! UGX ${amount.toLocaleString()} has been invested from your wallet by our operations team to help tenants access housing.\n\n💰 You'll earn 15% (UGX ${monthlyReward.toLocaleString()}) monthly on the ${payout_day}${getOrdinalSuffix(payout_day)} of every month for 12 months, starting ${firstPayoutDate}.\n\nThank you for being part of the Welile family! 🙏\n\nRef: ${referenceId}`,
      type: "success",
      metadata: { amount, reference_id: referenceId, payout_day, monthly_reward: monthlyReward, first_payout_date: firstPayoutDate, initiated_by: caller.id },
    });

    console.log(`[coo-invest-for-partner] COO ${caller.id} invested ${amount} from partner ${partner_id}'s wallet. Balance: ${partnerWallet.balance} → ${newBalance}. Ref: ${referenceId}, TxGroup: ${txGroupId}`);

    return new Response(
      JSON.stringify({
        success: true,
        reference_id: referenceId,
        new_balance: newBalance,
        payout_day,
        first_payout_date: firstPayoutDate,
        monthly_reward: monthlyReward,
        partner_name: partnerName,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[coo-invest-for-partner] Error:", msg);
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
