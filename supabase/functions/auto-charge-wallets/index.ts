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
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Calculate days between two date strings (YYYY-MM-DD).
 */
function daysBetween(dateStr: string, todayStr: string): number {
  const d1 = new Date(dateStr + "T00:00:00Z");
  const d2 = new Date(todayStr + "T00:00:00Z");
  return Math.floor((d2.getTime() - d1.getTime()) / 86400000);
}

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

    // Fetch active AND stalled charges that are due (stalled ones won't be re-processed, just skipped with a log)
    const { data: dueCharges, error: fetchError } = await supabase
      .from("subscription_charges")
      .select("*")
      .in("status", ["active"])
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
      catchup_debt: 0,
      stalled: 0,
      totalCharged: 0,
      totalDebt: 0,
      totalAgentCharged: 0,
      totalCatchupDebt: 0,
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
        const chargeAmount = Number(charge.charge_amount);

        // =====================================================
        // PART 1: CATCH-UP LOGIC — Skip stale backlog dates
        // =====================================================
        const missedDays = daysBetween(charge.next_charge_date, today);

        if (missedDays > 1) {
          // Calculate how many charge periods were missed
          let missedPeriods: number;
          if (charge.frequency === "daily") missedPeriods = missedDays;
          else if (charge.frequency === "weekly") missedPeriods = Math.floor(missedDays / 7);
          else missedPeriods = Math.floor(missedDays / 30);

          // Cap to remaining charges
          missedPeriods = Math.min(missedPeriods, charge.charges_remaining);

          if (missedPeriods > 0) {
            const catchupDebt = chargeAmount * missedPeriods;

            console.log(`[auto-charge-wallets] CATCH-UP: ${tenantName} has ${missedDays} stale days (${missedPeriods} missed ${charge.frequency} periods). Recording UGX ${catchupDebt} as debt.`);

            // Record the entire backlog as debt in one entry
            await supabase.from("subscription_charge_logs").insert({
              subscription_id: charge.id,
              tenant_id: charge.tenant_id,
              charge_amount: catchupDebt,
              amount_deducted: 0,
              debt_added: catchupDebt,
              wallet_balance_before: 0,
              wallet_balance_after: 0,
              status: "catchup_debt",
              charge_date: today,
            });

            // Update the charge: add catchup debt, advance completed/remaining, jump date to today
            const newRemaining = Math.max(0, charge.charges_remaining - missedPeriods);
            const isComplete = newRemaining <= 0;

            await supabase.from("subscription_charges").update({
              accumulated_debt: Number(charge.accumulated_debt) + catchupDebt,
              charges_completed: charge.charges_completed + missedPeriods,
              charges_remaining: newRemaining,
              next_charge_date: isComplete ? charge.next_charge_date : today,
              status: isComplete ? "completed" : "active",
              tenant_failed_at: null, // Clear stale grace period
              consecutive_failures: 0, // Reset since we're catching up
            }).eq("id", charge.id);

            // Notify agent about catch-up debt
            if (charge.agent_id) {
              await supabase.from("notifications").insert({
                user_id: charge.agent_id,
                title: "📋 Missed Payments Recorded as Debt",
                message: `${tenantName} (${tenantPhone}): ${missedPeriods} missed ${charge.frequency} payments totaling UGX ${catchupDebt.toLocaleString()} recorded as debt. Schedule advanced to today.`,
                type: "warning",
                metadata: { subscription_id: charge.id, tenant_id: charge.tenant_id, missed_periods: missedPeriods, catchup_debt: catchupDebt },
              });
            }

            results.catchup_debt++;
            results.totalCatchupDebt += catchupDebt;

            if (isComplete) {
              results.completed++;
              console.log(`[auto-charge-wallets] ${tenantName}: completed after catch-up`);
              continue;
            }

            // Refresh the charge object with updated values for today's processing
            charge.next_charge_date = today;
            charge.charges_remaining = newRemaining;
            charge.charges_completed = charge.charges_completed + missedPeriods;
            charge.accumulated_debt = Number(charge.accumulated_debt) + catchupDebt;
            charge.tenant_failed_at = null;
            charge.consecutive_failures = 0;
          }
        }

        // If charge_agent_wallet flag is set (no smartphone), skip tenant wallet entirely and charge agent
        if (charge.charge_agent_wallet && charge.agent_id) {
          console.log(`[auto-charge-wallets] charge_agent_wallet=true for ${charge.tenant_id}, charging agent ${charge.agent_id} directly`);
          let agentAmountCharged = 0;
          let debtAdded = 0;
          let logStatus: string;

          const agentCharged = await chargeAgent(supabase, charge, chargeAmount, today, tenantName, tenantPhone);
          if (agentCharged) {
            agentAmountCharged = chargeAmount;
            logStatus = "agent_direct_no_smartphone";
            results.agent_charged++;

            // Reset consecutive failures on success
            await supabase.from("subscription_charges").update({ consecutive_failures: 0 }).eq("id", charge.id);
          } else {
            // Don't record debt immediately — let the 3-hour retry function handle it
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
            await supabase.rpc("credit_agent_rent_commission", {
              p_rent_request_id: charge.rent_request_id, p_repayment_amount: agentAmountCharged,
              p_tenant_id: charge.tenant_id,
              p_event_reference_id: `auto-charge-nophone-${charge.id}-${today}`,
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

          // NOTE: Ledger entries now handled by sync_collection_to_ledger trigger
          // which fires on subscription_charge_logs insert and splits proportionally

          if (charge.rent_request_id) {
            await supabase.rpc("record_rent_request_repayment", {
              p_tenant_id: charge.tenant_id, p_amount: chargeAmount,
            });
            await supabase.rpc("credit_agent_rent_commission", {
              p_rent_request_id: charge.rent_request_id, p_repayment_amount: chargeAmount,
              p_tenant_id: charge.tenant_id,
              p_event_reference_id: `auto-charge-wallet-${charge.id}-${today}`,
            });
          }

          // Clear grace period and reset failures on success
          if (charge.tenant_failed_at || charge.consecutive_failures > 0) {
            await supabase.from("subscription_charges").update({
              tenant_failed_at: null,
              consecutive_failures: 0,
            }).eq("id", charge.id);
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

          if (tenantPhone) {
            const remaining = Math.max(0, charge.charges_remaining - 1);
            const sms = `WELILE: Dear ${tenantName}, UGX ${chargeAmount.toLocaleString()} deducted from your wallet for rent. ${remaining > 0 ? `${remaining} payments left.` : 'Rent fully paid!'} Access up to UGX 30M credit with WELILE!`;
            sendTenantSMS(tenantPhone, sms).catch(e => console.error("[auto-charge-wallets] SMS error:", e));
          }

          results.successful++;
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

          await supabase.from("notifications").insert({
            user_id: charge.tenant_id,
            title: "⚠️ Insufficient Wallet Balance",
            message: `Your instalment of UGX ${chargeAmount.toLocaleString()} could not be charged. You have 72 hours to top up before your agent is charged.`,
            type: "warning",
            metadata: { subscription_id: charge.id, amount: chargeAmount, grace_deadline: new Date(now.getTime() + GRACE_PERIOD_HOURS * 3600000).toISOString() },
          });

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

          // NOTE: Ledger entries now handled by sync_collection_to_ledger trigger
          // which fires on subscription_charge_logs insert and splits proportionally
        }

        const shortfall = chargeAmount - tenantPartial;

        if (charge.agent_id) {
          const agentCharged = await chargeAgent(supabase, charge, shortfall, today, tenantName, tenantPhone);
          if (agentCharged) {
            agentAmountCharged = shortfall;
            logStatus = tenantPartial > 0 ? "partial_agent_covered_72h" : "agent_covered_72h";
            results.agent_charged++;

            // Reset consecutive failures on success
            await supabase.from("subscription_charges").update({ consecutive_failures: 0 }).eq("id", charge.id);
          } else {
            debtAdded = shortfall;
            logStatus = tenantPartial > 0 ? "partial_72h" : "insufficient_72h";
            results.insufficient++;

            // =====================================================
            // PART 2: GRACE CIRCUIT BREAKER
            // =====================================================
            const newFailures = (charge.consecutive_failures || 0) + 1;

            if (newFailures >= MAX_CONSECUTIVE_FAILURES) {
              // Mark as stalled — stop processing until manual intervention
              await supabase.from("subscription_charges").update({
                status: "stalled",
                consecutive_failures: newFailures,
                tenant_failed_at: null,
              }).eq("id", charge.id);

              // =====================================================
              // PART 3: MANAGER STALLED ALERT
              // =====================================================
              // Notify all managers via notifications
              const { data: managers } = await supabase
                .from("profiles")
                .select("id")
                .eq("role", "manager");

              if (managers && managers.length > 0) {
                const managerNotifications = managers.map((m: any) => ({
                  user_id: m.id,
                  title: "🛑 Charge Stalled — Manual Intervention Required",
                  message: `${tenantName} (${tenantPhone}): ${newFailures} consecutive failed grace cycles. Both tenant and agent have insufficient funds. Charge amount: UGX ${chargeAmount.toLocaleString()}/day. Total accumulated debt: UGX ${(Number(charge.accumulated_debt) + debtAdded).toLocaleString()}.`,
                  type: "warning",
                  metadata: { subscription_id: charge.id, tenant_id: charge.tenant_id, agent_id: charge.agent_id, consecutive_failures: newFailures },
                }));
                await supabase.from("notifications").insert(managerNotifications);
              }

              // Notify agent
              await supabase.from("notifications").insert({
                user_id: charge.agent_id,
                title: "🛑 Charge Stalled — Action Required",
                message: `After ${newFailures} failed attempts, rent collection for ${tenantName} (${tenantPhone}) has been paused. Please top up your wallet or contact the tenant. Amount: UGX ${chargeAmount.toLocaleString()}.`,
                type: "warning",
                metadata: { subscription_id: charge.id, tenant_id: charge.tenant_id, amount: chargeAmount },
              });

              results.stalled++;
              console.log(`[auto-charge-wallets] STALLED: ${tenantName} after ${newFailures} consecutive failures`);
            } else {
              // Advance next_charge_date to TOMORROW (not +1 from stale date)
              // This prevents the backlog from growing further
              const tomorrow = new Date(now);
              tomorrow.setDate(tomorrow.getDate() + 1);
              const tomorrowStr = tomorrow.toISOString().split("T")[0];

              await supabase.from("subscription_charges").update({
                consecutive_failures: newFailures,
                tenant_failed_at: null, // Reset grace period for next cycle
              }).eq("id", charge.id);

              console.log(`[auto-charge-wallets] ${tenantName}: failure #${newFailures}/${MAX_CONSECUTIVE_FAILURES}, grace reset`);
            }
          }
        } else {
          debtAdded = shortfall;
          logStatus = tenantPartial > 0 ? "partial_no_agent" : "no_agent_insufficient";
          results.insufficient++;
        }

        // Clear grace period (already handled for stalled above, but needed for normal flow)
        if ((charge.consecutive_failures || 0) + 1 < MAX_CONSECUTIVE_FAILURES || agentAmountCharged > 0) {
          await supabase.from("subscription_charges").update({ tenant_failed_at: null }).eq("id", charge.id);
        }

        // Record rent repayment
        const totalCollected = amountDeducted + agentAmountCharged;
        if (charge.rent_request_id && totalCollected > 0) {
          await supabase.rpc("record_rent_request_repayment", {
            p_tenant_id: charge.tenant_id, p_amount: totalCollected,
          });
          await supabase.rpc("credit_agent_rent_commission", {
            p_rent_request_id: charge.rent_request_id, p_repayment_amount: totalCollected,
            p_tenant_id: charge.tenant_id,
            p_event_reference_id: `auto-charge-split-${charge.id}-${today}`,
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

    console.log(`[auto-charge-wallets] Done: ${results.successful} success, ${results.agent_charged} agent-covered, ${results.grace_period} grace-period, ${results.catchup_debt} catch-up, ${results.stalled} stalled, ${results.insufficient} insufficient`);

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
 * Advances next_charge_date to TOMORROW (relative to today) instead of +1 from stale date.
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

  // Always advance to TOMORROW from today, not +1 from stale next_charge_date
  const todayDate = new Date(opts.today + "T00:00:00Z");
  let nextDate: Date;
  if (charge.frequency === "daily") {
    nextDate = new Date(todayDate);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  } else if (charge.frequency === "weekly") {
    nextDate = new Date(todayDate);
    nextDate.setUTCDate(nextDate.getUTCDate() + 7);
  } else {
    nextDate = new Date(todayDate);
    nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
  }

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
  // Check agent's COMMISSION balance specifically (72h grace = commission usage)
  const { data: splitBalances, error: splitErr } = await supabase.rpc('get_agent_split_balances', {
    p_agent_id: charge.agent_id,
  });

  if (splitErr || !splitBalances) {
    console.error(`[auto-charge-wallets] Split balance RPC error for agent ${charge.agent_id}:`, splitErr);
    return false;
  }

  const balRow = Array.isArray(splitBalances) ? splitBalances[0] : splitBalances;
  const commissionBalance = Number(balRow?.commission_balance ?? 0);
  const description = `Tenant default (commission): ${tenantName} (${tenantPhone}) — ${charge.frequency} rent instalment after 72h grace [used_commission_for_rent=true]`;

  if (commissionBalance < shortfall) {
    console.log(`[auto-charge-wallets] Agent ${charge.agent_id} insufficient commission (${commissionBalance} < ${shortfall})`);

    // Record liability in ledger for the shortfall
    await supabase.from("general_ledger").insert({
      user_id: charge.agent_id,
      amount: shortfall,
      direction: "cash_out",
      category: "agent_liability",
      source_table: "subscription_charges",
      source_id: charge.id,
      description: `Agent guarantor liability — insufficient commission. ${description}`,
      linked_party: `${tenantName} (${tenantPhone})`,
      transaction_date: new Date().toISOString(),
      currency: 'UGX',
      role_type: 'agent',
    });

    return false;
  }

  // Ensure wallet exists (upsert)
  await supabase
    .from("wallets")
    .upsert({ user_id: charge.agent_id, balance: 0 }, { onConflict: "user_id", ignoreDuplicates: true });

  // Ledger-first: insert debit entry with commission-specific category — trigger handles balance
  const { error: ledgerErr } = await supabase.from("general_ledger").insert({
    user_id: charge.agent_id,
    amount: shortfall,
    direction: "cash_out",
    category: "agent_commission_used_for_rent",
    source_table: "subscription_charges",
    source_id: charge.id,
    description,
    linked_party: `${tenantName} (${tenantPhone})`,
    transaction_date: new Date().toISOString(),
    currency: 'UGX',
    role_type: 'agent',
  });

  if (ledgerErr) {
    console.error(`[auto-charge-wallets] Agent ledger insert error:`, ledgerErr);
    return false;
  }

  await supabase.from("pending_wallet_operations").insert({
    user_id: charge.agent_id,
    amount: shortfall,
    direction: "cash_out",
    category: "tenant_default_charge",
    source_table: "subscription_charges",
    source_id: charge.id,
    description,
    linked_party: `${tenantName} (${tenantPhone})`,
    status: "approved",
  });

  if (charge.rent_request_id) {
    await supabase.rpc("record_rent_request_repayment", {
      p_tenant_id: charge.tenant_id,
      p_amount: shortfall,
    });
    await supabase.rpc("credit_agent_rent_commission", {
      p_rent_request_id: charge.rent_request_id, p_repayment_amount: shortfall,
      p_tenant_id: charge.tenant_id,
      p_event_reference_id: `auto-charge-grace-${charge.id}-${today}`,
    });
  }

  console.log(`[auto-charge-wallets] Agent ${charge.agent_id} charged ${shortfall} via ledger for tenant ${tenantName} (${charge.tenant_id}) after 72h grace`);
  return true;
}
