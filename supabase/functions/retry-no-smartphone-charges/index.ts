import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Retries agent wallet charges for no-smartphone tenants every 3 hours.
 * Only processes charges where charge_agent_wallet = true and next_charge_date <= today.
 * After 24 hours of retries (8 attempts), records debt and advances the schedule.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date().toISOString().split("T")[0];
    const now = new Date();

    console.log(`[retry-no-smartphone] Running retry cycle at ${now.toISOString()}`);

    // Fetch only no-smartphone charges that are due (agent couldn't pay on first attempt)
    const { data: dueCharges, error: fetchError } = await supabase
      .from("subscription_charges")
      .select("*")
      .eq("status", "active")
      .eq("charge_agent_wallet", true)
      .lte("next_charge_date", today);

    if (fetchError) {
      throw new Error(`Failed to fetch charges: ${fetchError.message}`);
    }

    if (!dueCharges || dueCharges.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No pending no-smartphone charges to retry", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[retry-no-smartphone] Found ${dueCharges.length} pending no-smartphone charges`);

    const results = {
      processed: 0,
      collected: 0,
      still_pending: 0,
      debt_recorded: 0,
      total_collected: 0,
      total_debt: 0,
      errors: [] as string[],
    };

    for (const charge of dueCharges) {
      try {
        results.processed++;

        const chargeAmount = Number(charge.charge_amount);
        if (!charge.agent_id) {
          results.errors.push(`${charge.id}: No agent assigned`);
          continue;
        }

        // Fetch tenant name
        const { data: tenantProfile } = await supabase
          .from("profiles")
          .select("full_name, phone")
          .eq("id", charge.tenant_id)
          .single();
        const tenantName = tenantProfile?.full_name || "Unknown Tenant";
        const tenantPhone = tenantProfile?.phone || "";

        // Check how long this charge has been due (for 24h debt cutoff)
        const nextChargeDate = new Date(charge.next_charge_date + "T00:00:00Z");
        const hoursSinceDue = (now.getTime() - nextChargeDate.getTime()) / 3600000;

        // Try charging agent
        const { data: agentWallet, error: awErr } = await supabase
          .from("wallets")
          .select("balance")
          .eq("user_id", charge.agent_id)
          .single();

        if (awErr || !agentWallet) {
          console.error(`[retry-no-smartphone] No wallet for agent ${charge.agent_id}`);

          if (hoursSinceDue >= 24) {
            await recordDebtAndAdvance(supabase, charge, chargeAmount, tenantName, tenantPhone, today, now);
            results.debt_recorded++;
            results.total_debt += chargeAmount;
          } else {
            results.still_pending++;
          }
          continue;
        }

        const agentBalance = Number(agentWallet.balance);

        if (agentBalance >= chargeAmount) {
          // Agent can now pay — deduct with optimistic lock
          const newBalance = agentBalance - chargeAmount;
          const { data: updated, error: deductErr } = await supabase
            .from("wallets")
            .update({ balance: newBalance, updated_at: now.toISOString() })
            .eq("user_id", charge.agent_id)
            .eq("balance", agentBalance)
            .select("id")
            .maybeSingle();

          if (deductErr || !updated) {
            console.error(`[retry-no-smartphone] Deduct conflict for agent ${charge.agent_id}`);
            results.still_pending++;
            continue;
          }

          // Ledger entry
          const txGroupId = crypto.randomUUID();
          await supabase.from("general_ledger").insert({
            user_id: charge.agent_id,
            amount: chargeAmount,
            direction: "cash_out",
            category: "tenant_default_charge",
            source_table: "subscription_charges",
            source_id: charge.id,
            transaction_group_id: txGroupId,
            description: `No-smartphone tenant charge (retry): ${tenantName} (${tenantPhone}) — ${charge.frequency} instalment`,
            linked_party: `${tenantName} (${tenantPhone})`,
            transaction_date: now.toISOString(),
          });

          // Advance the charge schedule
          let nextDate = new Date(charge.next_charge_date);
          if (charge.frequency === "daily") nextDate.setDate(nextDate.getDate() + 1);
          else if (charge.frequency === "weekly") nextDate.setDate(nextDate.getDate() + 7);
          else nextDate.setMonth(nextDate.getMonth() + 1);

          const newChargesRemaining = Math.max(0, charge.charges_remaining - 1);
          const isComplete = newChargesRemaining <= 0;

          await supabase.from("subscription_charges").update({
            total_charged: Number(charge.total_charged) + chargeAmount,
            charges_completed: charge.charges_completed + 1,
            charges_remaining: newChargesRemaining,
            agent_charged_amount: Number(charge.agent_charged_amount || 0) + chargeAmount,
            agent_charge_count: (charge.agent_charge_count || 0) + 1,
            next_charge_date: isComplete ? charge.next_charge_date : nextDate.toISOString().split("T")[0],
            status: isComplete ? "completed" : "active",
          }).eq("id", charge.id);

          // Log success
          await supabase.from("subscription_charge_logs").insert({
            subscription_id: charge.id,
            tenant_id: charge.tenant_id,
            charge_amount: chargeAmount,
            amount_deducted: 0,
            debt_added: 0,
            wallet_balance_before: agentBalance,
            wallet_balance_after: newBalance,
            status: "agent_retry_success_no_smartphone",
            charge_date: today,
          });

          // Record rent repayment
          if (charge.rent_request_id) {
            await supabase.rpc("record_rent_request_repayment", {
              p_tenant_id: charge.tenant_id,
              p_amount: chargeAmount,
            });
            await supabase.rpc("credit_agent_rent_commission", {
              p_rent_request_id: charge.rent_request_id,
              p_repayment_amount: chargeAmount,
              p_source_table: "retry_no_smartphone_charges",
              p_source_id: charge.id,
            });
          }

          // Notify agent
          await supabase.from("notifications").insert({
            user_id: charge.agent_id,
            title: "✅ Retry Successful — Tenant Rent Collected",
            message: `UGX ${chargeAmount.toLocaleString()} deducted for ${tenantName} (${tenantPhone}) — ${charge.frequency} instalment. ${newChargesRemaining} payments remaining.`,
            type: "info",
            metadata: { subscription_id: charge.id, tenant_id: charge.tenant_id, amount: chargeAmount },
          });

          results.collected++;
          results.total_collected += chargeAmount;
          console.log(`[retry-no-smartphone] SUCCESS: Agent ${charge.agent_id} charged ${chargeAmount} for tenant ${tenantName}`);
        } else {
          // Still insufficient — check if 24h has passed to record debt
          if (hoursSinceDue >= 24) {
            await recordDebtAndAdvance(supabase, charge, chargeAmount, tenantName, tenantPhone, today, now);
            results.debt_recorded++;
            results.total_debt += chargeAmount;
            console.log(`[retry-no-smartphone] DEBT: 24h expired for tenant ${tenantName}, debt recorded`);
          } else {
            results.still_pending++;
            console.log(`[retry-no-smartphone] PENDING: Agent ${charge.agent_id} still insufficient (${agentBalance} < ${chargeAmount}), ${Math.round(hoursSinceDue)}h/${24}h`);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[retry-no-smartphone] Error processing ${charge.id}:`, msg);
        results.errors.push(`${charge.id}: ${msg}`);
      }
    }

    console.log(`[retry-no-smartphone] Done: ${results.collected} collected, ${results.still_pending} pending, ${results.debt_recorded} debt`);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[retry-no-smartphone] Fatal:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

/**
 * After 24 hours of retries, record debt and advance the charge schedule.
 */
async function recordDebtAndAdvance(
  supabase: ReturnType<typeof createClient>,
  charge: any,
  chargeAmount: number,
  tenantName: string,
  tenantPhone: string,
  today: string,
  now: Date,
) {
  // Record debt
  let nextDate = new Date(charge.next_charge_date);
  if (charge.frequency === "daily") nextDate.setDate(nextDate.getDate() + 1);
  else if (charge.frequency === "weekly") nextDate.setDate(nextDate.getDate() + 7);
  else nextDate.setMonth(nextDate.getMonth() + 1);

  const newChargesRemaining = Math.max(0, charge.charges_remaining - 1);
  const isComplete = newChargesRemaining <= 0;

  await supabase.from("subscription_charges").update({
    accumulated_debt: Number(charge.accumulated_debt) + chargeAmount,
    charges_completed: charge.charges_completed + 1,
    charges_remaining: newChargesRemaining,
    next_charge_date: isComplete ? charge.next_charge_date : nextDate.toISOString().split("T")[0],
    status: isComplete ? "completed" : "active",
  }).eq("id", charge.id);

  // Log
  await supabase.from("subscription_charge_logs").insert({
    subscription_id: charge.id,
    tenant_id: charge.tenant_id,
    charge_amount: chargeAmount,
    amount_deducted: 0,
    debt_added: chargeAmount,
    wallet_balance_before: 0,
    wallet_balance_after: 0,
    status: "agent_insufficient_24h_debt_no_smartphone",
    charge_date: today,
  });

  // Notify agent
  if (charge.agent_id) {
    await supabase.from("notifications").insert({
      user_id: charge.agent_id,
      title: "🚨 24h Retry Failed — Debt Recorded",
      message: `After 8 retry attempts, UGX ${chargeAmount.toLocaleString()} for ${tenantName} (${tenantPhone}) could not be collected. Recorded as debt.`,
      type: "warning",
      metadata: { subscription_id: charge.id, tenant_id: charge.tenant_id, tenant_name: tenantName, debt: chargeAmount },
    });
  }
}
