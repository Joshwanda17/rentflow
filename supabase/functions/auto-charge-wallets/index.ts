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

    const today = new Date().toISOString().split("T")[0];

    console.log(`[auto-charge-wallets] Processing charges due on or before ${today}`);

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
      agent_charged: 0,
      completed: 0,
      totalCharged: 0,
      totalDebt: 0,
      totalAgentCharged: 0,
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
        let agentAmountCharged = 0;
        let logStatus: string;
        let chargedParty = "tenant";

        if (walletBalance >= chargeAmount) {
          // Full charge from tenant
          amountDeducted = chargeAmount;
          logStatus = "success";
          results.successful++;
        } else {
          // Tenant can't fully pay — try agent fallback
          const tenantPartial = Math.max(0, walletBalance);
          const shortfall = chargeAmount - tenantPartial;

          // Deduct whatever tenant has
          if (tenantPartial > 0) {
            amountDeducted = tenantPartial;
          }

          // Try to charge the agent for the shortfall
          if (charge.agent_id) {
            const agentCharged = await chargeAgent(supabase, charge, shortfall, today);
            if (agentCharged) {
              agentAmountCharged = shortfall;
              logStatus = tenantPartial > 0 ? "partial_agent_covered" : "agent_covered";
              chargedParty = tenantPartial > 0 ? "both" : "agent";
              results.agent_charged++;
            } else {
              // Agent also can't pay — accumulate as debt
              debtAdded = shortfall;
              logStatus = tenantPartial > 0 ? "partial" : "insufficient_funds";
              if (tenantPartial > 0) results.partial++;
              else results.insufficient++;
            }
          } else {
            // No agent linked — accumulate as debt
            debtAdded = shortfall;
            logStatus = tenantPartial > 0 ? "partial" : "insufficient_funds";
            if (tenantPartial > 0) results.partial++;
            else results.insufficient++;
          }
        }

        // Deduct from tenant wallet if any amount
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
            status: "approved",
          });

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
        const totalAmountCollected = amountDeducted + agentAmountCharged;
        const newTotalCharged = Number(charge.total_charged) + totalAmountCollected;
        const newAccumulatedDebt = Number(charge.accumulated_debt) + debtAdded;
        const newChargesCompleted = charge.charges_completed + 1;
        const newChargesRemaining = Math.max(0, charge.charges_remaining - 1);
        const newAgentChargedAmount = Number(charge.agent_charged_amount || 0) + agentAmountCharged;
        const newAgentChargeCount = (charge.agent_charge_count || 0) + (agentAmountCharged > 0 ? 1 : 0);

        // Calculate next charge date
        let nextDate = new Date(charge.next_charge_date);
        if (charge.frequency === "daily") nextDate.setDate(nextDate.getDate() + 1);
        else if (charge.frequency === "weekly") nextDate.setDate(nextDate.getDate() + 7);
        else nextDate.setMonth(nextDate.getMonth() + 1);

        const isComplete = newChargesRemaining <= 0;

        await supabase
          .from("subscription_charges")
          .update({
            total_charged: newTotalCharged,
            accumulated_debt: newAccumulatedDebt,
            charges_completed: newChargesCompleted,
            charges_remaining: newChargesRemaining,
            agent_charged_amount: newAgentChargedAmount,
            agent_charge_count: newAgentChargeCount,
            next_charge_date: isComplete ? charge.next_charge_date : nextDate.toISOString().split("T")[0],
            status: isComplete ? "completed" : "active",
          })
          .eq("id", charge.id);

        if (isComplete) results.completed++;

        results.totalCharged += amountDeducted;
        results.totalDebt += debtAdded;
        results.totalAgentCharged += agentAmountCharged;

        // Send notifications
        if (logStatus === "success") {
          await supabase.from("notifications").insert({
            user_id: charge.tenant_id,
            title: "💳 Auto-Charge Processed",
            message: `UGX ${amountDeducted.toLocaleString()} deducted for your ${charge.service_type} instalment. ${newChargesRemaining} payments remaining.`,
            type: "info",
            metadata: { subscription_id: charge.id, amount: amountDeducted, remaining: newChargesRemaining },
          });
        } else if (logStatus === "agent_covered" || logStatus === "partial_agent_covered") {
          // Notify tenant that agent covered
          await supabase.from("notifications").insert({
            user_id: charge.tenant_id,
            title: "💳 Instalment Covered by Agent",
            message: `Your ${charge.frequency} instalment of UGX ${chargeAmount.toLocaleString()} was covered by your agent (UGX ${agentAmountCharged.toLocaleString()}). Please top up your wallet to avoid this.`,
            type: "warning",
            metadata: { subscription_id: charge.id, agent_covered: agentAmountCharged },
          });
          // Notify agent
          if (charge.agent_id) {
            await supabase.from("notifications").insert({
              user_id: charge.agent_id,
              title: "⚠️ You Were Charged for a Tenant",
              message: `UGX ${agentAmountCharged.toLocaleString()} was deducted from your wallet to cover a tenant's ${charge.frequency} instalment. Total you've covered: UGX ${newAgentChargedAmount.toLocaleString()}.`,
              type: "warning",
              metadata: { subscription_id: charge.id, tenant_id: charge.tenant_id, amount: agentAmountCharged },
            });
          }
        } else if (logStatus === "partial" || logStatus === "insufficient_funds") {
          await supabase.from("notifications").insert({
            user_id: charge.tenant_id,
            title: "⚠️ Insufficient Wallet Balance",
            message: `Your ${charge.frequency} instalment of UGX ${chargeAmount.toLocaleString()} could not be fully charged. ${debtAdded > 0 ? `UGX ${debtAdded.toLocaleString()} added to debt.` : ""} Please top up your wallet.`,
            type: "warning",
            metadata: { subscription_id: charge.id, charged: amountDeducted, debt: debtAdded, total_debt: newAccumulatedDebt },
          });
          // Also notify agent about the debt
          if (charge.agent_id) {
            await supabase.from("notifications").insert({
              user_id: charge.agent_id,
              title: "⚠️ Tenant & Agent Insufficient Funds",
              message: `Neither you nor your tenant could cover the UGX ${chargeAmount.toLocaleString()} instalment. UGX ${debtAdded.toLocaleString()} added as debt. Please help the tenant top up.`,
              type: "warning",
              metadata: { subscription_id: charge.id, tenant_id: charge.tenant_id, debt: debtAdded },
            });
          }
        }

        console.log(`[auto-charge-wallets] ${charge.tenant_id}: ${logStatus} - tenant:${amountDeducted}, agent:${agentAmountCharged}, debt:${debtAdded}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[auto-charge-wallets] Error processing ${charge.id}:`, msg);
        results.errors.push(`${charge.id}: ${msg}`);
      }
    }

    console.log(`[auto-charge-wallets] Done: ${results.successful} success, ${results.agent_charged} agent-covered, ${results.partial} partial, ${results.insufficient} insufficient`);

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

/**
 * Attempt to charge the agent's wallet for the shortfall amount.
 * Returns true if successful, false if agent also has insufficient funds.
 */
async function chargeAgent(
  supabase: ReturnType<typeof createClient>,
  charge: any,
  shortfall: number,
  today: string,
): Promise<boolean> {
  const { data: agentWallet, error: awErr } = await supabase
    .from("wallets")
    .select("balance")
    .eq("user_id", charge.agent_id)
    .single();

  if (awErr || !agentWallet) {
    console.error(`[auto-charge-wallets] No wallet for agent ${charge.agent_id}`);
    return false;
  }

  const agentBalance = Number(agentWallet.balance);
  if (agentBalance < shortfall) {
    console.log(`[auto-charge-wallets] Agent ${charge.agent_id} also insufficient (${agentBalance} < ${shortfall})`);
    return false;
  }

  // Deduct from agent
  const newAgentBalance = agentBalance - shortfall;
  const { error: deductErr } = await supabase
    .from("wallets")
    .update({ balance: newAgentBalance, updated_at: new Date().toISOString() })
    .eq("user_id", charge.agent_id);

  if (deductErr) {
    console.error(`[auto-charge-wallets] Agent deduct error:`, deductErr);
    return false;
  }

  // Record in pending_wallet_operations
  const txGroupId = crypto.randomUUID();
  await supabase.from("pending_wallet_operations").insert({
    user_id: charge.agent_id,
    amount: shortfall,
    direction: "cash_out",
    category: "tenant_access_fee",
    source_table: "subscription_charges",
    source_id: charge.id,
    transaction_group_id: txGroupId,
    description: `Agent fallback charge: covering tenant instalment (${charge.frequency}) for subscription ${charge.id}`,
    linked_party: charge.tenant_id,
    status: "approved",
  });

  // Also record as repayment against the rent request
  if (charge.rent_request_id) {
    await supabase.rpc("record_rent_request_repayment", {
      p_tenant_id: charge.tenant_id,
      p_amount: shortfall,
    });
  }

  console.log(`[auto-charge-wallets] Agent ${charge.agent_id} charged ${shortfall} for tenant ${charge.tenant_id}`);
  return true;
}
