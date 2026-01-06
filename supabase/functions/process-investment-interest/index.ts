import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INTEREST_RATE = 0.15; // 15% monthly

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current month in YYYY-MM format
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    console.log(`Processing interest for month: ${currentMonth}`);

    // Get all approved investment accounts with balance > 0
    const { data: accounts, error: accountsError } = await supabase
      .from("investment_accounts")
      .select("id, user_id, name, balance")
      .eq("status", "approved")
      .gt("balance", 0);

    if (accountsError) {
      throw accountsError;
    }

    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No eligible accounts found",
          processed: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let skipped = 0;
    const results = [];

    for (const account of accounts) {
      // Check if interest was already paid for this month
      const { data: existingPayment } = await supabase
        .from("investment_interest_payments")
        .select("id")
        .eq("account_id", account.id)
        .eq("payment_month", currentMonth)
        .single();

      if (existingPayment) {
        console.log(`Skipping account ${account.id} - already paid for ${currentMonth}`);
        skipped++;
        continue;
      }

      const principalAmount = Number(account.balance);
      const interestAmount = principalAmount * INTEREST_RATE;

      // Record the interest payment
      const { error: paymentError } = await supabase
        .from("investment_interest_payments")
        .insert({
          account_id: account.id,
          user_id: account.user_id,
          principal_amount: principalAmount,
          interest_rate: INTEREST_RATE,
          interest_amount: interestAmount,
          payment_month: currentMonth,
        });

      if (paymentError) {
        console.error(`Error recording payment for account ${account.id}:`, paymentError);
        continue;
      }

      // Credit the interest to the user's wallet
      const { data: wallet, error: walletFetchError } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", account.user_id)
        .single();

      if (walletFetchError) {
        console.error(`Error fetching wallet for user ${account.user_id}:`, walletFetchError);
        continue;
      }

      const newWalletBalance = Number(wallet.balance) + interestAmount;

      const { error: walletUpdateError } = await supabase
        .from("wallets")
        .update({ balance: newWalletBalance })
        .eq("user_id", account.user_id);

      if (walletUpdateError) {
        console.error(`Error updating wallet for user ${account.user_id}:`, walletUpdateError);
        continue;
      }

      // Send notification to user
      await supabase.from("notifications").insert({
        user_id: account.user_id,
        title: "💰 Monthly Interest Credited!",
        message: `Your investment account "${account.name}" earned UGX ${interestAmount.toLocaleString()} (15% of UGX ${principalAmount.toLocaleString()}). The interest has been added to your wallet!`,
        type: "success",
        metadata: {
          account_id: account.id,
          account_name: account.name,
          principal: principalAmount,
          interest: interestAmount,
          month: currentMonth,
        },
      });

      processed++;
      results.push({
        account_id: account.id,
        account_name: account.name,
        principal: principalAmount,
        interest: interestAmount,
      });

      console.log(`Credited ${interestAmount} interest to user ${account.user_id} for account ${account.name}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Interest processing complete for ${currentMonth}`,
        processed,
        skipped,
        total_accounts: accounts.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error processing investment interest:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});