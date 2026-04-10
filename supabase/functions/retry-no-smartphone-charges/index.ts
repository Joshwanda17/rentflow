import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date().toISOString().split("T")[0];
    const now = new Date();

    const { data: dueCharges, error: fetchError } = await supabase
      .from("subscription_charges")
      .select("*")
      .eq("status", "active")
      .eq("charge_agent_wallet", true)
      .lte("next_charge_date", today);

    if (fetchError) throw new Error(`Failed to fetch charges: ${fetchError.message}`);

    if (!dueCharges || dueCharges.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No pending no-smartphone charges to retry", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = { processed: 0, collected: 0, still_pending: 0, debt_recorded: 0, total_collected: 0, total_debt: 0, errors: [] as string[] };

    for (const charge of dueCharges) {
      try {
        results.processed++;
        const chargeAmount = Number(charge.charge_amount);
        if (!charge.agent_id) { results.errors.push(`${charge.id}: No agent`); continue; }

        const { data: tenantProfile } = await supabase.from("profiles").select("full_name, phone").eq("id", charge.tenant_id).single();
        const tenantName = tenantProfile?.full_name || "Unknown Tenant";
        const tenantPhone = tenantProfile?.phone || "";

        const nextChargeDate = new Date(charge.next_charge_date + "T00:00:00Z");
        const hoursSinceDue = (now.getTime() - nextChargeDate.getTime()) / 3600000;

        const { data: agentWallet, error: awErr } = await supabase.from("wallets").select("balance").eq("user_id", charge.agent_id).single();

        if (awErr || !agentWallet) {
          if (hoursSinceDue >= 24) {
            await recordDebtAndAdvance(supabase, charge, chargeAmount, tenantName, tenantPhone, today, now);
            results.debt_recorded++; results.total_debt += chargeAmount;
          } else { results.still_pending++; }
          continue;
        }

        const agentBalance = Number(agentWallet.balance);

        if (agentBalance >= chargeAmount) {
          // Balanced RPC: wallet cash_out + platform cash_in
          const { error: rpcErr } = await supabase.rpc('create_ledger_transaction', {
            entries: [
              {
                user_id: charge.agent_id, ledger_scope: 'wallet', direction: 'cash_out',
                amount: chargeAmount, category: 'agent_float_used_for_rent',
                source_table: 'subscription_charges', source_id: charge.id,
                description: `No-smartphone tenant charge (retry): ${tenantName} (${tenantPhone})`,
                currency: 'UGX', transaction_date: now.toISOString(),
              },
              {
                ledger_scope: 'platform', direction: 'cash_in',
                amount: chargeAmount, category: 'agent_repayment',
                source_table: 'subscription_charges', source_id: charge.id,
                description: `Agent payment for no-smartphone tenant ${tenantName}`,
                currency: 'UGX', transaction_date: now.toISOString(),
              },
            ],
          });

          if (rpcErr) {
            console.error(`[retry-no-smartphone] RPC error:`, rpcErr);
            results.errors.push(`${charge.id}: RPC failed`);
            continue;
          }

          // Advance schedule
          const todayDate = new Date(today + "T00:00:00Z");
          let nextDate: Date;
          if (charge.frequency === "daily") { nextDate = new Date(todayDate); nextDate.setUTCDate(nextDate.getUTCDate() + 1); }
          else if (charge.frequency === "weekly") { nextDate = new Date(todayDate); nextDate.setUTCDate(nextDate.getUTCDate() + 7); }
          else { nextDate = new Date(todayDate); nextDate.setUTCMonth(nextDate.getUTCMonth() + 1); }

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

          await supabase.from("subscription_charge_logs").insert({
            subscription_id: charge.id, tenant_id: charge.tenant_id,
            charge_amount: chargeAmount, amount_deducted: 0, debt_added: 0,
            wallet_balance_before: agentBalance, wallet_balance_after: agentBalance - chargeAmount,
            status: "agent_retry_success_no_smartphone", charge_date: today,
          });

          if (charge.rent_request_id) {
            await supabase.rpc("record_rent_request_repayment", { p_tenant_id: charge.tenant_id, p_amount: chargeAmount });
            await supabase.rpc("credit_agent_rent_commission", {
              p_rent_request_id: charge.rent_request_id, p_repayment_amount: chargeAmount,
              p_tenant_id: charge.tenant_id, p_event_reference_id: `retry-nophone-${charge.id}-${today}`,
            });
          }

          await supabase.from("notifications").insert({
            user_id: charge.agent_id, title: "✅ Retry Successful — Tenant Rent Collected",
            message: `UGX ${chargeAmount.toLocaleString()} deducted for ${tenantName} (${tenantPhone})`,
            type: "info", metadata: { subscription_id: charge.id, tenant_id: charge.tenant_id, amount: chargeAmount },
          });

          results.collected++; results.total_collected += chargeAmount;
        } else {
          if (hoursSinceDue >= 24) {
            await recordDebtAndAdvance(supabase, charge, chargeAmount, tenantName, tenantPhone, today, now);
            results.debt_recorded++; results.total_debt += chargeAmount;
          } else { results.still_pending++; }
        }
      } catch (err: unknown) {
        results.errors.push(`${charge.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[retry-no-smartphone] Fatal:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});

async function recordDebtAndAdvance(
  supabase: ReturnType<typeof createClient>, charge: any, chargeAmount: number,
  tenantName: string, tenantPhone: string, today: string, now: Date,
) {
  const todayDate = new Date(today + "T00:00:00Z");
  let nextDate: Date;
  if (charge.frequency === "daily") { nextDate = new Date(todayDate); nextDate.setUTCDate(nextDate.getUTCDate() + 1); }
  else if (charge.frequency === "weekly") { nextDate = new Date(todayDate); nextDate.setUTCDate(nextDate.getUTCDate() + 7); }
  else { nextDate = new Date(todayDate); nextDate.setUTCMonth(nextDate.getUTCMonth() + 1); }

  const newChargesRemaining = Math.max(0, charge.charges_remaining - 1);
  const isComplete = newChargesRemaining <= 0;

  await supabase.from("subscription_charges").update({
    accumulated_debt: Number(charge.accumulated_debt) + chargeAmount,
    charges_completed: charge.charges_completed + 1,
    charges_remaining: newChargesRemaining,
    next_charge_date: isComplete ? charge.next_charge_date : nextDate.toISOString().split("T")[0],
    status: isComplete ? "completed" : "active",
  }).eq("id", charge.id);

  await supabase.from("subscription_charge_logs").insert({
    subscription_id: charge.id, tenant_id: charge.tenant_id,
    charge_amount: chargeAmount, amount_deducted: 0, debt_added: chargeAmount,
    wallet_balance_before: 0, wallet_balance_after: 0,
    status: "agent_insufficient_24h_debt_no_smartphone", charge_date: today,
  });

  if (charge.agent_id) {
    await supabase.from("notifications").insert({
      user_id: charge.agent_id, title: "🚨 24h Retry Failed — Debt Recorded",
      message: `After retries, UGX ${chargeAmount.toLocaleString()} for ${tenantName} (${tenantPhone}) recorded as debt.`,
      type: "warning", metadata: { subscription_id: charge.id, tenant_id: charge.tenant_id, debt: chargeAmount },
    });
  }
}
