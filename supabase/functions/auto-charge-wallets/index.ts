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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    console.log(`[auto-charge-wallets] Processing charges due on or before ${today}`);

    // Get all active subscriptions with charges due today or earlier
    const { data: dueCharges, error: fetchError } = await supabase
      .from("subscription_charges")
      .select("*")
      .eq("status", "active")
      .lte("next_charge_date", today);

    if (fetchError) {
      throw new Error(`Failed to fetch due charges: ${fetchError.message}`);
    }

    if (!dueCharges || dueCharges.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No charges due today", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[auto-charge-wallets] Found ${dueCharges.length} due charges`);

    const results = {
      processed: 0,
      successful: 0,
      partial: 0,
      insufficient: 0,
      completed: 0,
      totalCharged: 0,
      totalDebt: 0,
      errors: [] as string[],
    };

    for (const charge of dueCharges) {
      try {
        results.processed++;

        // Get tenant wallet balance
        const { data: wallet, error: walletError } = await supabase
          .from("wallets")
          .select("balance")
          .eq("user_id", charge.tenant_id)
          .single();

        if (walletError || !wallet) {
          console.error(`[auto-charge-wallets] No wallet for tenant ${charge.tenant_id}`);
          results.errors.push(`${charge.id}: No wallet found`);
          continue;
        }

        const walletBalance = Number(wallet.balance);
        const chargeAmount = Number(charge.charge_amount);
        let amountDeducted = 0;
        let debtAdded = 0;
        let logStatus: string;

        if (walletBalance >= chargeAmount) {
          // Full charge
          amountDeducted = chargeAmount;
          logStatus = "success";
          results.successful++;
        } else if (walletBalance > 0) {
          // Partial - deduct what's available, rest becomes debt
          amountDeducted = walletBalance;
          debtAdded = chargeAmount - walletBalance;
          logStatus = "partial";
          results.partial++;
        } else {
          // No funds - full amount becomes debt
          debtAdded = chargeAmount;
          logStatus = "insufficient_funds";
          results.insufficient++;
        }

        // Deduct from wallet if any amount available
        if (amountDeducted > 0) {
          const newBalance = walletBalance - amountDeducted;
          const { error: deductError } = await supabase
            .from("wallets")
            .update({ balance: newBalance, updated_at: new Date().toISOString() })
            .eq("user_id", charge.tenant_id);

          if (deductError) {
            console.error(`[auto-charge-wallets] Deduct error for ${charge.tenant_id}:`, deductError);
            results.errors.push(`${charge.id}: Deduction failed`);
            continue;
          }

          // Record in general ledger via pending_wallet_operations
          const txGroupId = crypto.randomUUID();
          await supabase.from("pending_wallet_operations").insert({
            user_id: charge.tenant_id,
            amount: amountDeducted,
            direction: "cash_out",
            category: "tenant_access_fee",
            source_table: "subscription_charges",
            source_id: charge.id,
            transaction_group_id: txGroupId,
            description: `Auto-charge: ${charge.service_type} instalment (${charge.frequency})`,
            linked_party: "platform",
            status: "approved", // Auto-approved since it's system-initiated
          });

          // Also record repayment against the rent request
          if (charge.rent_request_id) {
            await supabase.rpc("record_rent_request_repayment", {
              p_tenant_id: charge.tenant_id,
              p_amount: amountDeducted,
            });
          }
        }

        // Log the charge attempt
        await supabase.from("subscription_charge_logs").insert({
          subscription_id: charge.id,
          tenant_id: charge.tenant_id,
          charge_amount: chargeAmount,
          amount_deducted: amountDeducted,
          debt_added: debtAdded,
          wallet_balance_before: walletBalance,
          wallet_balance_after: walletBalance - amountDeducted,
          status: logStatus,
          charge_date: today,
        });

        // Update subscription totals
        const newTotalCharged = Number(charge.total_charged) + amountDeducted;
        const newAccumulatedDebt = Number(charge.accumulated_debt) + debtAdded;
        const newChargesCompleted = charge.charges_completed + 1;
        const newChargesRemaining = Math.max(0, charge.charges_remaining - 1);

        // Calculate next charge date
        let nextDate = new Date(charge.next_charge_date);
        if (charge.frequency === "daily") {
          nextDate.setDate(nextDate.getDate() + 1);
        } else if (charge.frequency === "weekly") {
          nextDate.setDate(nextDate.getDate() + 7);
        } else if (charge.frequency === "monthly") {
          nextDate.setMonth(nextDate.getMonth() + 1);
        }

        // Check if subscription is complete
        const isComplete = newChargesRemaining <= 0;

        await supabase
          .from("subscription_charges")
          .update({
            total_charged: newTotalCharged,
            accumulated_debt: newAccumulatedDebt,
            charges_completed: newChargesCompleted,
            charges_remaining: newChargesRemaining,
            next_charge_date: isComplete ? charge.next_charge_date : nextDate.toISOString().split("T")[0],
            status: isComplete ? "completed" : "active",
          })
          .eq("id", charge.id);

        if (isComplete) results.completed++;

        results.totalCharged += amountDeducted;
        results.totalDebt += debtAdded;

        // Send in-app notification
        if (logStatus === "success") {
          await supabase.from("notifications").insert({
            user_id: charge.tenant_id,
            title: "💳 Auto-Charge Processed",
            message: `UGX ${amountDeducted.toLocaleString()} deducted for your ${charge.service_type} instalment. ${newChargesRemaining} payments remaining.`,
            type: "info",
            metadata: {
              subscription_id: charge.id,
              amount: amountDeducted,
              remaining: newChargesRemaining,
            },
          });
        } else if (logStatus === "partial" || logStatus === "insufficient_funds") {
          await supabase.from("notifications").insert({
            user_id: charge.tenant_id,
            title: "⚠️ Insufficient Wallet Balance",
            message: `Your ${charge.frequency} instalment of UGX ${chargeAmount.toLocaleString()} could not be fully charged. ${debtAdded > 0 ? `UGX ${debtAdded.toLocaleString()} added to your outstanding debt.` : ""} Please top up your wallet.`,
            type: "warning",
            metadata: {
              subscription_id: charge.id,
              charged: amountDeducted,
              debt: debtAdded,
              total_debt: newAccumulatedDebt,
            },
          });
        }

        console.log(`[auto-charge-wallets] ${charge.tenant_id}: ${logStatus} - charged ${amountDeducted}, debt ${debtAdded}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[auto-charge-wallets] Error processing ${charge.id}:`, msg);
        results.errors.push(`${charge.id}: ${msg}`);
      }
    }

    console.log(`[auto-charge-wallets] Done: ${results.successful} success, ${results.partial} partial, ${results.insufficient} insufficient`);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[auto-charge-wallets] Fatal:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
