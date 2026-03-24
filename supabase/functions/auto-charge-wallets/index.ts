import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function formatPhoneInternational(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("256")) return `+${digits}`;
  if (digits.startsWith("0")) return `+256${digits.slice(1)}`;
  if (digits.length === 9) return `+256${digits}`;
  return `+${digits}`;
}

async function sendTenantSMS(phone: string, message: string): Promise<boolean> {
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  const username = Deno.env.get("AFRICASTALKING_USERNAME");
  if (!apiKey || !username || !phone) return false;
  const isSandbox = username.toLowerCase() === "sandbox";
  const baseUrl = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
  try {
    const body = new URLSearchParams({ username, to: formatPhoneInternational(phone), message });
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", apiKey, Accept: "application/json" },
      body: body.toString(),
    });
    const data = await res.json();
    const recipients = data?.SMSMessageData?.Recipients || [];
    return recipients.some((r: any) => r.statusCode === 101 || r.statusCode === 100);
  } catch { return false; }
}

const GRACE_PERIOD_HOURS = 72;

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
      grace_period: 0,
      completed: 0,
      totalCharged: 0,
      totalDebt: 0,
      totalAgentCharged: 0,
      errors: [] as string[],
    };

    for (const charge of dueCharges) {
      try {
        results.processed++;

        // Fetch tenant name for clear descriptions
        const { data: tenantProfile } = await supabase
          .from("profiles")
          .select("full_name, phone")
          .eq("id", charge.tenant_id)
          .single();
        const tenantName = tenantProfile?.full_name || "Unknown Tenant";
        const tenantPhone = tenantProfile?.phone || "";

        // If charge_agent_wallet flag is set (no smartphone), skip tenant wallet entirely and charge agent
        // No grace period for no-smartphone tenants — agent agreed to cover them
        if (charge.charge_agent_wallet && charge.agent_id) {
          console.log(`[auto-charge-wallets] charge_agent_wallet=true for ${charge.tenant_id}, charging agent ${charge.agent_id} directly`);
          const chargeAmount = Number(charge.charge_amount);
          let agentAmountCharged = 0;
          let debtAdded = 0;
          let logStatus: string;

          const agentCharged = await chargeAgent(supabase, charge, chargeAmount, today, tenantName, tenantPhone);
          if (agentCharged) {
            agentAmountCharged = chargeAmount;
            logStatus = "agent_direct_no_smartphone";
            results.agent_charged++;
          } else {
            // Don't record debt immediately — let the 3-hour retry function handle it
            // Just mark this attempt as pending retry and skip advancing the charge
            logStatus = "agent_insufficient_no_smartphone_retry_pending";
            results.insufficient++;

            // Log the failed attempt
            await supabase.from("subscription_charge_logs").insert({
              subscription_id: charge.id,
              tenant_id: charge.tenant_id,
              charge_amount: chargeAmount,
              amount_deducted: 0,
              debt_added: 0,
              wallet_balance_before: 0,
              wallet_balance_after: 0,
              status: logStatus,
              charge_date: today,
            });

            // Notify agent
            await supabase.from("notifications").insert({
              user_id: charge.agent_id,
              title: "⚠️ Insufficient Funds — Retrying in 3 Hours",
              message: `Couldn't deduct UGX ${chargeAmount.toLocaleString()} for ${tenantName} (${tenantPhone}). System will retry every 3 hours until covered.`,
              type: "warning",
              metadata: { subscription_id: charge.id, tenant_id: charge.tenant_id, tenant_name: tenantName, amount: chargeAmount },
            });

            console.log(`[auto-charge-wallets] ${charge.tenant_id}: agent insufficient (no-smartphone), will retry in 3h`);
            continue;
          }

          await logAndUpdateCharge(supabase, charge, {
            chargeAmount, amountDeducted: 0, agentAmountCharged, debtAdded,
            walletBefore: 0, walletAfter: 0, logStatus, tenantName, tenantPhone, today,
          });

          if (charge.rent_request_id && agentAmountCharged > 0) {
            await supabase.rpc("record_rent_request_repayment", {
              p_tenant_id: charge.tenant_id, p_amount: agentAmountCharged,
            });
            // Credit agent 5% commission
            await supabase.rpc("credit_agent_rent_commission", {
              p_rent_request_id: charge.rent_request_id, p_repayment_amount: agentAmountCharged,
              p_source_table: "auto_charge_wallets", p_source_id: charge.id,
            });
          }

          // Notify agent
          if (agentAmountCharged > 0) {
            await supabase.from("notifications").insert({
              user_id: charge.agent_id,
              title: "💳 Auto-Charge: No-Smartphone Tenant",
              message: `UGX ${agentAmountCharged.toLocaleString()} deducted for ${tenantName}'s (${tenantPhone}) ${charge.frequency} rent instalment (no smartphone). Remaining payments: ${Math.max(0, charge.charges_remaining - 1)}.`,
              type: "info",
              metadata: { subscription_id: charge.id, tenant_id: charge.tenant_id, tenant_name: tenantName, tenant_phone: tenantPhone, amount: agentAmountCharged },
            });
          } else if (debtAdded > 0) {
            await supabase.from("notifications").insert({
              user_id: charge.agent_id,
              title: "⚠️ Insufficient Funds for Tenant",
              message: `Couldn't cover UGX ${chargeAmount.toLocaleString()} for ${tenantName} (${tenantPhone}). UGX ${debtAdded.toLocaleString()} added as debt.`,
              type: "warning",
              metadata: { subscription_id: charge.id, tenant_id: charge.tenant_id, tenant_name: tenantName, debt: debtAdded },
            });
          }

          // SMS to tenant (no-smartphone) about agent payment
          if (agentAmountCharged > 0 && tenantPhone) {
            const remaining = Number(charge.charges_remaining) - 1;
            const sms = `WELILE: Dear ${tenantName}, UGX ${agentAmountCharged.toLocaleString()} has been paid for your rent by your agent. ${remaining > 0 ? `${remaining} payments remaining.` : 'Rent fully paid!'} Access up to UGX 30M with WELILE. Ask your agent!`;
            sendTenantSMS(tenantPhone, sms).catch(e => console.error("[auto-charge-wallets] SMS error:", e));
          }

          results.totalAgentCharged += agentAmountCharged;
          results.totalDebt += debtAdded;
          console.log(`[auto-charge-wallets] ${charge.tenant_id}: ${logStatus} (no-smartphone) - agent:${agentAmountCharged}, debt:${debtAdded}`);
          continue;
        }

        // === STANDARD FLOW: Try tenant wallet first ===
        const { data: wallet, error: walletError } = await supabase
          .from("wallets")
          .select("balance")
          .eq("user_id", charge.tenant_id)
          .single();

        const walletBalance = (!walletError && wallet) ? Number(wallet.balance) : 0;
        const chargeAmount = Number(charge.charge_amount);
        const hasSufficientFunds = walletBalance >= chargeAmount;

        // === TENANT CAN PAY: charge them, clear grace period ===
        if (hasSufficientFunds) {
          const newBalance = walletBalance - chargeAmount;
          const { error: deductError } = await supabase
            .from("wallets")
            .update({ balance: newBalance, updated_at: now.toISOString() })
            .eq("user_id", charge.tenant_id);

          if (deductError) {
            console.error(`[auto-charge-wallets] Deduct error for ${charge.tenant_id}:`, deductError);
            results.errors.push(`${charge.id}: Deduction failed`);
            continue;
          }

          // Record in ledger
          const txGroupId = crypto.randomUUID();
          await supabase.from("general_ledger").insert({
            user_id: charge.tenant_id,
            amount: chargeAmount,
            direction: "cash_out",
            category: "tenant_access_fee",
            source_table: "subscription_charges",
            source_id: charge.id,
            transaction_group_id: txGroupId,
            description: `Auto-charge: ${charge.service_type} instalment (${charge.frequency})`,
            linked_party: "platform",
            transaction_date: now.toISOString(),
          });

          if (charge.rent_request_id) {
            await supabase.rpc("record_rent_request_repayment", {
              p_tenant_id: charge.tenant_id, p_amount: chargeAmount,
            });
            // Credit agent 5% commission on tenant's own payment
            await supabase.rpc("credit_agent_rent_commission", {
              p_rent_request_id: charge.rent_request_id, p_repayment_amount: chargeAmount,
              p_source_table: "auto_charge_wallets", p_source_id: charge.id,
            });
          }

          // Clear grace period if it was set
          if (charge.tenant_failed_at) {
            await supabase.from("subscription_charges").update({ tenant_failed_at: null }).eq("id", charge.id);
          }

          await logAndUpdateCharge(supabase, charge, {
            chargeAmount, amountDeducted: chargeAmount, agentAmountCharged: 0, debtAdded: 0,
            walletBefore: walletBalance, walletAfter: newBalance, logStatus: "success", tenantName, tenantPhone, today,
          });

          await supabase.from("notifications").insert({
            user_id: charge.tenant_id,
            title: "💳 Auto-Charge Processed",
            message: `UGX ${chargeAmount.toLocaleString()} deducted for your ${charge.service_type} instalment. ${Math.max(0, charge.charges_remaining - 1)} payments remaining.`,
            type: "info",
            metadata: { subscription_id: charge.id, amount: chargeAmount },
          });

          // SMS confirmation to tenant
          if (tenantPhone) {
            const remaining = Math.max(0, charge.charges_remaining - 1);
            const sms = `WELILE: Dear ${tenantName}, UGX ${chargeAmount.toLocaleString()} deducted from your wallet for rent. ${remaining > 0 ? `${remaining} payments left.` : 'Rent fully paid!'} Access up to UGX 30M credit with WELILE!`;
            sendTenantSMS(tenantPhone, sms).catch(e => console.error("[auto-charge-wallets] SMS error:", e));
          }

          results.totalCharged += chargeAmount;
          console.log(`[auto-charge-wallets] ${charge.tenant_id}: success - tenant:${chargeAmount}`);
          continue;
        }

        // === TENANT CANNOT PAY: Check 72-hour grace period ===
        const tenantFailedAt = charge.tenant_failed_at ? new Date(charge.tenant_failed_at) : null;

        if (!tenantFailedAt) {
          // First failure — start the 72-hour grace period
          await supabase.from("subscription_charges").update({
            tenant_failed_at: now.toISOString(),
          }).eq("id", charge.id);

          console.log(`[auto-charge-wallets] ${charge.tenant_id}: Starting 72h grace period`);

          // Notify tenant
          await supabase.from("notifications").insert({
            user_id: charge.tenant_id,
            title: "⚠️ Insufficient Wallet Balance",
            message: `Your instalment of UGX ${chargeAmount.toLocaleString()} could not be charged. You have 72 hours to top up before your agent is charged.`,
            type: "warning",
            metadata: { subscription_id: charge.id, amount: chargeAmount, grace_deadline: new Date(now.getTime() + GRACE_PERIOD_HOURS * 3600000).toISOString() },
          });

          // Notify agent about pending grace period
          if (charge.agent_id) {
            await supabase.from("notifications").insert({
              user_id: charge.agent_id,
              title: "⏳ Tenant Payment Pending — 72h Grace",
              message: `${tenantName} (${tenantPhone}) could not pay UGX ${chargeAmount.toLocaleString()}. If unpaid in 72 hours, it will be deducted from your wallet.`,
              type: "info",
              metadata: { subscription_id: charge.id, tenant_id: charge.tenant_id, tenant_name: tenantName, tenant_phone: tenantPhone, amount: chargeAmount },
            });
          }

          results.grace_period++;
          continue;
        }

        // Check if grace period has elapsed
        const hoursSinceFailure = (now.getTime() - tenantFailedAt.getTime()) / 3600000;

        if (hoursSinceFailure < GRACE_PERIOD_HOURS) {
          // Still within grace period — skip, don't charge agent yet
          console.log(`[auto-charge-wallets] ${charge.tenant_id}: Still in grace period (${Math.round(hoursSinceFailure)}h / ${GRACE_PERIOD_HOURS}h)`);
          results.grace_period++;
          continue;
        }

        // === GRACE PERIOD EXPIRED: Charge agent ===
        console.log(`[auto-charge-wallets] ${charge.tenant_id}: Grace period expired (${Math.round(hoursSinceFailure)}h). Charging agent.`);

        // Try partial from tenant first
        const tenantPartial = Math.max(0, walletBalance);
        let amountDeducted = 0;
        let agentAmountCharged = 0;
        let debtAdded = 0;
        let logStatus: string;

        if (tenantPartial > 0) {
          amountDeducted = tenantPartial;
          const newBalance = walletBalance - tenantPartial;
          await supabase.from("wallets")
            .update({ balance: newBalance, updated_at: now.toISOString() })
            .eq("user_id", charge.tenant_id);

          await supabase.from("general_ledger").insert({
            user_id: charge.tenant_id,
            amount: tenantPartial,
            direction: "cash_out",
            category: "tenant_access_fee",
            source_table: "subscription_charges",
            source_id: charge.id,
            description: `Auto-charge: partial instalment (${charge.frequency})`,
            linked_party: "platform",
            transaction_date: now.toISOString(),
          });
        }

        const shortfall = chargeAmount - tenantPartial;

        if (charge.agent_id) {
          const agentCharged = await chargeAgent(supabase, charge, shortfall, today, tenantName, tenantPhone);
          if (agentCharged) {
            agentAmountCharged = shortfall;
            logStatus = tenantPartial > 0 ? "partial_agent_covered_72h" : "agent_covered_72h";
            results.agent_charged++;
          } else {
            debtAdded = shortfall;
            logStatus = tenantPartial > 0 ? "partial_72h" : "insufficient_72h";
            results.insufficient++;
          }
        } else {
          debtAdded = shortfall;
          logStatus = tenantPartial > 0 ? "partial_no_agent" : "no_agent_insufficient";
          results.insufficient++;
        }

        // Clear grace period
        await supabase.from("subscription_charges").update({ tenant_failed_at: null }).eq("id", charge.id);

        // Record rent repayment
        const totalCollected = amountDeducted + agentAmountCharged;
        if (charge.rent_request_id && totalCollected > 0) {
          await supabase.rpc("record_rent_request_repayment", {
            p_tenant_id: charge.tenant_id, p_amount: totalCollected,
          });
          // Credit agent 5% commission
          await supabase.rpc("credit_agent_rent_commission", {
            p_rent_request_id: charge.rent_request_id, p_repayment_amount: totalCollected,
            p_source_table: "auto_charge_wallets", p_source_id: charge.id,
          });
        }

        await logAndUpdateCharge(supabase, charge, {
          chargeAmount, amountDeducted, agentAmountCharged, debtAdded,
          walletBefore: walletBalance, walletAfter: walletBalance - amountDeducted,
          logStatus, tenantName, tenantPhone, today,
        });

        // Notifications
        if (agentAmountCharged > 0 && charge.agent_id) {
          await supabase.from("notifications").insert({
            user_id: charge.agent_id,
            title: "⚠️ 72h Grace Expired — You Were Charged",
            message: `${tenantName} (${tenantPhone}) didn't pay within 72 hours. UGX ${agentAmountCharged.toLocaleString()} deducted from your wallet for their ${charge.frequency} rent instalment.`,
            type: "warning",
            metadata: { subscription_id: charge.id, tenant_id: charge.tenant_id, tenant_name: tenantName, tenant_phone: tenantPhone, amount: agentAmountCharged },
          });

          await supabase.from("notifications").insert({
            user_id: charge.tenant_id,
            title: "💳 Instalment Covered by Agent",
            message: `Your agent covered UGX ${agentAmountCharged.toLocaleString()} for your ${charge.frequency} instalment after 72h. Please top up to avoid this.`,
            type: "warning",
            metadata: { subscription_id: charge.id, agent_covered: agentAmountCharged },
          });


          // SMS to tenant that agent covered their rent
          if (tenantPhone) {
            const totalPaid = amountDeducted + agentAmountCharged;
            const sms = `WELILE: Dear ${tenantName}, UGX ${totalPaid.toLocaleString()} has been paid towards your rent${agentAmountCharged > 0 ? ' (covered by your agent)' : ''}. Please top up your wallet. Access up to UGX 30M with WELILE!`;
            sendTenantSMS(tenantPhone, sms).catch(e => console.error("[auto-charge-wallets] SMS error:", e));
          }
        }

        if (debtAdded > 0 && charge.agent_id) {
          await supabase.from("notifications").insert({
            user_id: charge.agent_id,
            title: "⚠️ Tenant & Agent Insufficient — Debt Added",
            message: `Neither you nor ${tenantName} (${tenantPhone}) could cover UGX ${chargeAmount.toLocaleString()}. UGX ${debtAdded.toLocaleString()} added as debt.`,
            type: "warning",
            metadata: { subscription_id: charge.id, tenant_id: charge.tenant_id, tenant_name: tenantName, debt: debtAdded },
          });
        }

        results.totalCharged += amountDeducted;
        results.totalAgentCharged += agentAmountCharged;
        results.totalDebt += debtAdded;

        console.log(`[auto-charge-wallets] ${charge.tenant_id}: ${logStatus} - tenant:${amountDeducted}, agent:${agentAmountCharged}, debt:${debtAdded}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[auto-charge-wallets] Error processing ${charge.id}:`, msg);
        results.errors.push(`${charge.id}: ${msg}`);
      }
    }

    console.log(`[auto-charge-wallets] Done: ${results.successful} success, ${results.agent_charged} agent-covered, ${results.grace_period} grace-period, ${results.partial} partial, ${results.insufficient} insufficient`);

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
 * Log charge attempt and update subscription totals.
 */
async function logAndUpdateCharge(
  supabase: ReturnType<typeof createClient>,
  charge: any,
  opts: {
    chargeAmount: number; amountDeducted: number; agentAmountCharged: number;
    debtAdded: number; walletBefore: number; walletAfter: number;
    logStatus: string; tenantName: string; tenantPhone: string; today: string;
  },
) {
  await supabase.from("subscription_charge_logs").insert({
    subscription_id: charge.id,
    tenant_id: charge.tenant_id,
    charge_amount: opts.chargeAmount,
    amount_deducted: opts.amountDeducted,
    debt_added: opts.debtAdded,
    wallet_balance_before: opts.walletBefore,
    wallet_balance_after: opts.walletAfter,
    status: opts.logStatus,
    charge_date: opts.today,
  });

  const totalCollected = opts.amountDeducted + opts.agentAmountCharged;
  const newTotalCharged = Number(charge.total_charged) + totalCollected;
  const newAccumulatedDebt = Number(charge.accumulated_debt) + opts.debtAdded;
  const newChargesCompleted = charge.charges_completed + 1;
  const newChargesRemaining = Math.max(0, charge.charges_remaining - 1);
  const newAgentChargedAmount = Number(charge.agent_charged_amount || 0) + opts.agentAmountCharged;
  const newAgentChargeCount = (charge.agent_charge_count || 0) + (opts.agentAmountCharged > 0 ? 1 : 0);

  let nextDate = new Date(charge.next_charge_date);
  if (charge.frequency === "daily") nextDate.setDate(nextDate.getDate() + 1);
  else if (charge.frequency === "weekly") nextDate.setDate(nextDate.getDate() + 7);
  else nextDate.setMonth(nextDate.getMonth() + 1);

  const isComplete = newChargesRemaining <= 0;

  await supabase.from("subscription_charges").update({
    total_charged: newTotalCharged,
    accumulated_debt: newAccumulatedDebt,
    charges_completed: newChargesCompleted,
    charges_remaining: newChargesRemaining,
    agent_charged_amount: newAgentChargedAmount,
    agent_charge_count: newAgentChargeCount,
    next_charge_date: isComplete ? charge.next_charge_date : nextDate.toISOString().split("T")[0],
    status: isComplete ? "completed" : "active",
  }).eq("id", charge.id);
}

/**
 * Charge the agent's wallet for shortfall with clear tenant details in ledger.
 */
async function chargeAgent(
  supabase: ReturnType<typeof createClient>,
  charge: any,
  shortfall: number,
  today: string,
  tenantName: string,
  tenantPhone: string,
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
    console.log(`[auto-charge-wallets] Agent ${charge.agent_id} insufficient (${agentBalance} < ${shortfall})`);
    return false;
  }

  const newAgentBalance = agentBalance - shortfall;
  // Optimistic lock to prevent double-deduction
  const { error: deductErr } = await supabase
    .from("wallets")
    .update({ balance: newAgentBalance, updated_at: new Date().toISOString() })
    .eq("user_id", charge.agent_id)
    .eq("balance", agentBalance);

  if (deductErr) {
    console.error(`[auto-charge-wallets] Agent deduct error:`, deductErr);
    return false;
  }

  const txGroupId = crypto.randomUUID();
  const description = `Tenant default: ${tenantName} (${tenantPhone}) — ${charge.frequency} rent instalment after 72h grace`;

  // Record in general_ledger for wallet history visibility
  await supabase.from("general_ledger").insert({
    user_id: charge.agent_id,
    amount: shortfall,
    direction: "cash_out",
    category: "tenant_default_charge",
    source_table: "subscription_charges",
    source_id: charge.id,
    transaction_group_id: txGroupId,
    description,
    linked_party: `${tenantName} (${tenantPhone})`,
    transaction_date: new Date().toISOString(),
  });

  // Also record in pending_wallet_operations for audit
  await supabase.from("pending_wallet_operations").insert({
    user_id: charge.agent_id,
    amount: shortfall,
    direction: "cash_out",
    category: "tenant_default_charge",
    source_table: "subscription_charges",
    source_id: charge.id,
    transaction_group_id: txGroupId,
    description,
    linked_party: `${tenantName} (${tenantPhone})`,
    status: "approved",
  });

  if (charge.rent_request_id) {
    await supabase.rpc("record_rent_request_repayment", {
      p_tenant_id: charge.tenant_id,
      p_amount: shortfall,
    });
    // Credit agent 5% commission on grace-period recovery
    await supabase.rpc("credit_agent_rent_commission", {
      p_rent_request_id: charge.rent_request_id, p_repayment_amount: shortfall,
      p_source_table: "auto_charge_wallets", p_source_id: charge.id,
    });
  }

  console.log(`[auto-charge-wallets] Agent ${charge.agent_id} charged ${shortfall} for tenant ${tenantName} (${charge.tenant_id}) after 72h grace`);
  return true;
}
