import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logSystemEvent } from "../_shared/eventLogger.ts";
import { checkTreasuryGuard } from "../_shared/treasuryGuard.ts";

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

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { deposit_request_id, action, rejection_reason, bulk_ids } = body as {
      deposit_request_id?: string;
      action?: string;
      rejection_reason?: string;
      bulk_ids?: string[];
    };

    if (!action || !["approve", "reject"].includes(action)) {
      return new Response(
        JSON.stringify({ error: "Invalid action. Must be 'approve' or 'reject'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    let idsToProcess: string[] = [];
    if (bulk_ids && Array.isArray(bulk_ids)) {
      if (bulk_ids.length > 100) {
        return new Response(
          JSON.stringify({ error: "Cannot process more than 100 deposits at once" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      idsToProcess = bulk_ids.filter(id => typeof id === 'string' && UUID_REGEX.test(id));
    } else if (deposit_request_id && typeof deposit_request_id === 'string' && UUID_REGEX.test(deposit_request_id)) {
      idsToProcess = [deposit_request_id];
    }

    if (idsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid deposit IDs provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const safeRejectionReason = typeof rejection_reason === 'string' ? rejection_reason.trim().slice(0, 1000) : undefined;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Treasury guard: block credits when paused (deposits credit user wallets)
    const guardBlock = await checkTreasuryGuard(supabaseAdmin, "credit");
    if (guardBlock) return guardBlock;

    const { data: isManagerRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "manager")
      .maybeSingle();

    const { data: processorProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    const processorName = processorProfile?.full_name || "Manager";

    const { data: depositRequests, error: fetchError } = await supabaseAdmin
      .from("deposit_requests")
      .select("*")
      .in("id", idsToProcess)
      .eq("status", "pending");

    if (fetchError || !depositRequests || depositRequests.length === 0) {
      return new Response(
        JSON.stringify({ error: "No pending deposit requests found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isManagerRole) {
      const unauthorized = depositRequests.filter(d => d.agent_id !== user.id);
      if (unauthorized.length > 0) {
        return new Response(
          JSON.stringify({ error: "Not authorized to process some requests" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const results: Array<{ id: string; status: string; amount: number; user_id: string; repayment_applied?: number; debt_cleared?: number; days_prepaid?: number }> = [];

    for (const depositRequest of depositRequests) {
      try {
        if (action === "approve") {
          // Update status
          await supabaseAdmin
            .from("deposit_requests")
            .update({ status: "approved", approved_at: new Date().toISOString(), processed_by: user.id })
            .eq("id", depositRequest.id);

          // Ensure wallet row exists (sync_wallet_from_ledger handles actual balance)
          await supabaseAdmin
            .from("wallets")
            .upsert({ user_id: depositRequest.user_id, balance: 0, updated_at: new Date().toISOString() }, { onConflict: "user_id", ignoreDuplicates: true });

          // ── Ledger-first deposit credit (balanced double-entry) ──
          const { error: depositLedgerErr } = await supabaseAdmin.rpc('create_ledger_transaction', {
            entries: [
              {
                user_id: depositRequest.user_id,
                amount: depositRequest.amount,
                direction: 'cash_in',
                category: 'wallet_deposit',
                ledger_scope: 'wallet',
                source_table: 'deposit_requests',
                source_id: depositRequest.id,
                reference_id: depositRequest.transaction_id || depositRequest.id,
                description: `Wallet deposit via ${depositRequest.provider || 'mobile money'}`,
                currency: 'UGX',
                transaction_date: new Date().toISOString(),
              },
              {
                direction: 'cash_out',
                amount: depositRequest.amount,
                category: 'wallet_deposit',
                ledger_scope: 'platform',
                source_table: 'deposit_requests',
                source_id: depositRequest.id,
                description: 'Platform liability: deposit credited to user wallet',
                currency: 'UGX',
                transaction_date: new Date().toISOString(),
              },
            ],
          });

          if (depositLedgerErr) {
            console.error(`[approve-deposit] Deposit ledger entry failed for ${depositRequest.id}:`, depositLedgerErr.message);
            throw new Error(`Deposit ledger entry failed: ${depositLedgerErr.message}`);
          }

          // ── Operational Float Sweep ──
          // If an agent deposits with purpose=operational_float, sweep the credited
          // amount from their personal wallet into their agent_landlord_float bucket
          // so it can be used to pay landlords/tenants (NOT their personal wallet).
          let sweptToFloat = 0;
          {
            const explicitFloat = depositRequest.deposit_purpose === 'operational_float';
            const ambiguousPurpose = !depositRequest.deposit_purpose
              || depositRequest.deposit_purpose === 'other';

            // Look up agent role once
            const { data: agentRoleRow } = await supabaseAdmin
              .from('user_roles')
              .select('role')
              .eq('user_id', depositRequest.user_id)
              .eq('role', 'agent')
              .maybeSingle();

            const isAgent = !!agentRoleRow;

            // Detect proxy-agent role: these agents fund partner portfolios from
            // their wallet ledger (via coo-create-portfolio) and must NOT have
            // their deposits swept into landlord-payout float.
            const { data: proxyRow } = await supabaseAdmin
              .from('proxy_agent_assignments')
              .select('id')
              .eq('agent_id', depositRequest.user_id)
              .eq('is_active', true)
              .eq('approval_status', 'approved')
              .limit(1)
              .maybeSingle();
            const isProxyAgent = !!proxyRow;

            if (isAgent && isProxyAgent && !explicitFloat) {
              console.log(
                `[approve-deposit] Skipping float sweep — user ${depositRequest.user_id} is a proxy agent; deposit stays in wallet for partner portfolio funding`
              );
            }

            // Sweep when:
            //  (a) explicitly tagged operational_float (always honoured), OR
            //  (b) ambiguous purpose AND agent is NOT a proxy agent.
            const shouldSweep = isAgent
              && !(isProxyAgent && !explicitFloat)
              && (explicitFloat || ambiguousPurpose);
            const autoRouted = isAgent && !explicitFloat && ambiguousPurpose;

            if (shouldSweep) {
              const sweepAmount = Number(depositRequest.amount);
              const { error: sweepLedgerErr } = await supabaseAdmin.rpc('create_ledger_transaction', {
                entries: [
                  {
                    user_id: depositRequest.user_id,
                    amount: sweepAmount,
                    direction: 'cash_out',
                    category: 'agent_float_deposit',
                    ledger_scope: 'wallet',
                    source_table: 'deposit_requests',
                    source_id: depositRequest.id,
                    reference_id: depositRequest.transaction_id || depositRequest.id,
                    description: autoRouted
                      ? `Auto-routed to operational float — agent deposit w/ ambiguous purpose (${depositRequest.provider || 'mobile money'})`
                      : `Sweep to operational float (${depositRequest.provider || 'mobile money'})`,
                    currency: 'UGX',
                    transaction_date: new Date().toISOString(),
                  },
                  {
                    user_id: depositRequest.user_id,
                    direction: 'cash_in',
                    amount: sweepAmount,
                    category: 'agent_float_deposit',
                    ledger_scope: 'platform',
                    source_table: 'deposit_requests',
                    source_id: depositRequest.id,
                    description: 'Operational float credited to agent landlord float',
                    currency: 'UGX',
                    transaction_date: new Date().toISOString(),
                  },
                ],
              });

              if (sweepLedgerErr) {
                console.error(`[approve-deposit] Float sweep ledger failed for ${depositRequest.id}:`, sweepLedgerErr.message);
              } else {
                // Note: agent_landlord_float is updated automatically by the
                // general_ledger_route_buckets trigger on agent_float_deposit entries.
                await supabaseAdmin.from('agent_float_funding').insert({
                  agent_id: depositRequest.user_id,
                  amount: sweepAmount,
                  status: 'approved',
                  funded_by: user.id,
                  bank_reference: depositRequest.transaction_id,
                  bank_name: depositRequest.provider,
                  notes: autoRouted
                    ? `Auto-routed agent deposit (ambiguous purpose) via ${depositRequest.provider || 'mobile money'} (deposit ${depositRequest.id})`
                    : `Self-deposit operational float via ${depositRequest.provider || 'mobile money'} (deposit ${depositRequest.id})`,
                });

                // Audit the auto-routing override so it is traceable
                if (autoRouted) {
                  await supabaseAdmin.from('audit_logs').insert({
                    user_id: user.id,
                    action_type: 'auto_routed_to_float',
                    table_name: 'deposit_requests',
                    record_id: depositRequest.id,
                    reason: `Agent deposit ${depositRequest.id} (UGX ${sweepAmount}) had no/ambiguous purpose — auto-routed to operational float by approve-deposit safety net.`,
                    metadata: {
                      agent_id: depositRequest.user_id,
                      amount: sweepAmount,
                      original_purpose: depositRequest.deposit_purpose ?? null,
                      provider: depositRequest.provider ?? null,
                      transaction_id: depositRequest.transaction_id ?? null,
                    },
                  } as any);
                }

                sweptToFloat = sweepAmount;
                console.log(`[approve-deposit] Swept UGX ${sweepAmount} to operational float for agent ${depositRequest.user_id}${autoRouted ? ' (auto-routed)' : ''}`);
              }
            }
          }

          // ── Step 1: Auto-deduct rent repayment ──
          // The sync_wallet_from_ledger trigger has now credited the wallet.
          let repaymentApplied = 0;
          let rentRequestId: string | null = null;
          let newOutstanding = 0;

          // Re-read wallet after ledger credit to know available balance
          const { data: walletAfterCredit } = await supabaseAdmin
            .from("wallets")
            .select("balance")
            .eq("user_id", depositRequest.user_id)
            .single();

          let availableBalance = walletAfterCredit?.balance || 0;

          const { data: activeRentRequest } = await supabaseAdmin
            .from("rent_requests")
            .select("id, total_repayment, amount_repaid, rent_amount, status")
            .eq("tenant_id", depositRequest.user_id)
            .in("status", ["funded", "disbursed", "approved"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (activeRentRequest) {
            const outstanding = Number(activeRentRequest.total_repayment) - Number(activeRentRequest.amount_repaid);
            rentRequestId = activeRentRequest.id;

            if (outstanding > 0 && availableBalance > 0) {
              repaymentApplied = Math.min(availableBalance, outstanding);
              newOutstanding = outstanding - repaymentApplied;

              // Record repayment via RPC (updates rent_requests.amount_repaid, landlords.rent_balance_due, inserts repayment + ledger)
              const { error: repaymentError } = await supabaseAdmin.rpc(
                "record_rent_request_repayment",
                { p_tenant_id: depositRequest.user_id, p_amount: repaymentApplied }
              );

              if (repaymentError) {
                console.error(`[approve-deposit] Repayment RPC failed for ${depositRequest.id}:`, repaymentError.message);
                repaymentApplied = 0;
                newOutstanding = outstanding;
              } else {
                // Balanced RPC: wallet cash_out + platform cash_in
                const { data: txGroupId, error: rentLedgerErr } = await supabaseAdmin.rpc('create_ledger_transaction', {
                  entries: [
                    {
                      user_id: depositRequest.user_id,
                      amount: repaymentApplied,
                      direction: 'cash_out',
                      category: 'tenant_repayment',
                      ledger_scope: 'wallet',
                      source_table: 'deposit_requests',
                      source_id: depositRequest.id,
                      reference_id: depositRequest.transaction_id || depositRequest.id,
                      description: `Auto rent deduction from deposit (TXN: ${depositRequest.transaction_id || 'N/A'})`,
                      currency: 'UGX',
                      linked_party: rentRequestId,
                      transaction_date: new Date().toISOString(),
                    },
                    {
                      direction: 'cash_in',
                      amount: repaymentApplied,
                      category: 'tenant_repayment',
                      ledger_scope: 'platform',
                      source_table: 'deposit_requests',
                      source_id: depositRequest.id,
                      description: `Platform receives rent repayment from deposit`,
                      currency: 'UGX',
                      transaction_date: new Date().toISOString(),
                    },
                  ],
                });
                if (rentLedgerErr) {
                  console.error(`[approve-deposit] Rent ledger RPC failed:`, rentLedgerErr);
                }

                availableBalance -= repaymentApplied;

                // ── Credit agent commission via RPC (single-writer — RPC owns commission) ──
                if (rentRequestId) {
                  await supabaseAdmin.rpc("credit_agent_rent_commission", {
                    p_rent_request_id: rentRequestId,
                    p_repayment_amount: repaymentApplied,
                    p_tenant_id: depositRequest.user_id,
                    p_event_reference_id: `approve-deposit-rent-${txGroupId}`,
                  });
                }
              }
            }
          }

          // ── Step 2: Clear accumulated debt & pre-pay future days ──
          let debtCleared = 0;
          let daysPrepaid = 0;
          let prepaidAmount = 0;
          let newNextChargeDate: string | null = null;

          const { data: activeSub } = await supabaseAdmin
            .from("subscription_charges")
            .select("id, accumulated_debt, charge_amount, charges_remaining, charges_completed, next_charge_date, tenant_failed_at, rent_request_id")
            .eq("tenant_id", depositRequest.user_id)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (activeSub) {
            // Re-read wallet to get actual balance (trigger may have updated it)
            const { data: walletNow } = await supabaseAdmin
              .from("wallets").select("balance")
              .eq("user_id", depositRequest.user_id).single();

            availableBalance = walletNow?.balance || 0;
            const subTxGroupId = crypto.randomUUID();

            // 2a. Clear accumulated debt
            const debt = Number(activeSub.accumulated_debt || 0);
            if (debt > 0 && availableBalance > 0) {
              debtCleared = Math.min(debt, availableBalance);

              // Update subscription debt
              await supabaseAdmin
                .from("subscription_charges")
                .update({ accumulated_debt: debt - debtCleared, updated_at: new Date().toISOString() })
                .eq("id", activeSub.id);

              // Balanced RPC: wallet cash_out + platform cash_in for debt clearance
              const { error: debtLedgerErr } = await supabaseAdmin.rpc('create_ledger_transaction', {
                entries: [
                  {
                    user_id: depositRequest.user_id,
                    amount: debtCleared,
                    direction: 'cash_out',
                    category: 'tenant_repayment',
                    ledger_scope: 'wallet',
                    source_table: 'subscription_charges',
                    source_id: activeSub.id,
                    reference_id: depositRequest.transaction_id || depositRequest.id,
                    description: `Auto debt clearance from deposit (UGX ${debtCleared.toLocaleString()})`,
                    currency: 'UGX',
                    linked_party: activeSub.rent_request_id,
                    transaction_date: new Date().toISOString(),
                  },
                  {
                    direction: 'cash_in',
                    amount: debtCleared,
                    category: 'tenant_repayment',
                    ledger_scope: 'platform',
                    source_table: 'subscription_charges',
                    source_id: activeSub.id,
                    description: `Platform receives debt clearance from deposit`,
                    currency: 'UGX',
                    transaction_date: new Date().toISOString(),
                  },
                ],
              });
              if (debtLedgerErr) console.error(`[approve-deposit] Debt ledger RPC failed:`, debtLedgerErr);

              availableBalance -= debtCleared;

              // Record as rent repayment if linked to a rent request
              if (activeSub.rent_request_id) {
                await supabaseAdmin.rpc("record_rent_request_repayment", {
                  p_tenant_id: depositRequest.user_id,
                  p_amount: debtCleared,
                });

                // Credit agent commission via RPC (single-writer)
                if (activeSub.rent_request_id) {
                  await supabaseAdmin.rpc("credit_agent_rent_commission", {
                    p_rent_request_id: activeSub.rent_request_id,
                    p_repayment_amount: debtCleared,
                    p_tenant_id: depositRequest.user_id,
                    p_event_reference_id: `approve-deposit-debt-${subTxGroupId}`,
                  });
                }
              }
            }

            // 2b. Pre-pay future days if surplus remains
            // Re-read wallet again since trigger may have fired
            const { data: walletForPrepay } = await supabaseAdmin
              .from("wallets").select("balance")
              .eq("user_id", depositRequest.user_id).single();
            availableBalance = walletForPrepay?.balance || 0;

            const chargeAmount = Number(activeSub.charge_amount || 0);
            const chargesRemaining = Number(activeSub.charges_remaining || 0);
            if (chargeAmount > 0 && availableBalance >= chargeAmount && chargesRemaining > 0) {
              daysPrepaid = Math.min(
                Math.floor(availableBalance / chargeAmount),
                chargesRemaining
              );
              prepaidAmount = daysPrepaid * chargeAmount;

              const currentNext = new Date(activeSub.next_charge_date);
              currentNext.setDate(currentNext.getDate() + daysPrepaid);
              newNextChargeDate = currentNext.toISOString();

              // Update subscription
              await supabaseAdmin
                .from("subscription_charges")
                .update({
                  charges_completed: Number(activeSub.charges_completed || 0) + daysPrepaid,
                  charges_remaining: chargesRemaining - daysPrepaid,
                  next_charge_date: newNextChargeDate,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", activeSub.id);

              // Balanced RPC: wallet cash_out + platform cash_in for prepaid fees
              const { error: prepayLedgerErr } = await supabaseAdmin.rpc('create_ledger_transaction', {
                entries: [
                  {
                    user_id: depositRequest.user_id,
                    amount: prepaidAmount,
                    direction: 'cash_out',
                    category: 'tenant_repayment',
                    ledger_scope: 'wallet',
                    source_table: 'subscription_charges',
                    source_id: activeSub.id,
                    reference_id: depositRequest.transaction_id || depositRequest.id,
                    description: `Pre-paid ${daysPrepaid} days (UGX ${prepaidAmount.toLocaleString()})`,
                    currency: 'UGX',
                    linked_party: activeSub.rent_request_id,
                    transaction_date: new Date().toISOString(),
                  },
                  {
                    direction: 'cash_in',
                    amount: prepaidAmount,
                    category: 'access_fee_collected',
                    ledger_scope: 'platform',
                    source_table: 'subscription_charges',
                    source_id: activeSub.id,
                    description: `Pre-paid ${daysPrepaid} days access fee`,
                    currency: 'UGX',
                    transaction_date: new Date().toISOString(),
                  },
                ],
              });
              if (prepayLedgerErr) console.error(`[approve-deposit] Prepay ledger RPC failed:`, prepayLedgerErr);

              availableBalance -= prepaidAmount;

              // Record as rent repayment if linked
              if (activeSub.rent_request_id) {
                await supabaseAdmin.rpc("record_rent_request_repayment", {
                  p_tenant_id: depositRequest.user_id,
                  p_amount: prepaidAmount,
                });

                // Credit agent commission via RPC (single-writer)
                if (activeSub.rent_request_id) {
                  await supabaseAdmin.rpc("credit_agent_rent_commission", {
                    p_rent_request_id: activeSub.rent_request_id,
                    p_repayment_amount: prepaidAmount,
                    p_tenant_id: depositRequest.user_id,
                    p_event_reference_id: `approve-deposit-prepay-${subTxGroupId}`,
                  });
                }
              }
            }

            // 2c. Clear grace period
            if (activeSub.tenant_failed_at && (debtCleared > 0 || prepaidAmount > 0)) {
              await supabaseAdmin
                .from("subscription_charges")
                .update({ tenant_failed_at: null, updated_at: new Date().toISOString() })
                .eq("id", activeSub.id);
            }
            // ── Notify agent via push when debt is cleared ──
            if (debtCleared > 0 && depositRequest.agent_id) {
              const { data: tenantProfile } = await supabaseAdmin
                .from("profiles").select("full_name").eq("id", depositRequest.user_id).single();
              const tenantName = tenantProfile?.full_name || "A tenant";

              // In-app notification for the agent
              await supabaseAdmin.from("notifications").insert({
                user_id: depositRequest.agent_id,
                title: "Tenant Debt Cleared! ✅",
                message: `${tenantName}'s debt of UGX ${debtCleared.toLocaleString()} has been auto-cleared from their deposit.${daysPrepaid > 0 ? ` ${daysPrepaid} day(s) also pre-paid.` : ''}`,
                type: "success",
                metadata: {
                  tenant_id: depositRequest.user_id,
                  debt_cleared: debtCleared,
                  days_prepaid: daysPrepaid,
                  deposit_request_id: depositRequest.id,
                },
              });

              // Push notification to agent
              try {
                await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${supabaseServiceKey}`,
                  },
                  body: JSON.stringify({
                    user_id: depositRequest.agent_id,
                    title: "Tenant Debt Cleared! ✅",
                    body: `${tenantName}'s debt of UGX ${debtCleared.toLocaleString()} auto-cleared from deposit.`,
                    url: "/dashboard",
                  }),
                });
              } catch (pushErr) {
                console.warn("[approve-deposit] Agent push notification failed:", pushErr);
              }
            }
          }

          // ── Notification ──
          const repaymentNote = repaymentApplied > 0
            ? ` UGX ${repaymentApplied.toLocaleString()} auto-deducted for rent (remaining: UGX ${newOutstanding.toLocaleString()}).`
            : "";
          const debtNote = debtCleared > 0
            ? ` Debt of UGX ${debtCleared.toLocaleString()} cleared.`
            : "";
          const prepaidNote = daysPrepaid > 0
            ? ` ${daysPrepaid} future day(s) pre-paid (UGX ${prepaidAmount.toLocaleString()}). Next charge: ${newNextChargeDate ? new Date(newNextChargeDate).toLocaleDateString() : 'N/A'}.`
            : "";

          let notifTitle = "Deposit Approved! 💰";
          if (debtCleared > 0 || daysPrepaid > 0) notifTitle = "Deposit Approved & Auto-Applied! 💰";
          else if (repaymentApplied > 0) notifTitle = "Deposit Approved & Rent Deducted! 💰";

          await supabaseAdmin.from("notifications").insert({
            user_id: depositRequest.user_id,
            title: notifTitle,
            message: `Your deposit of UGX ${depositRequest.amount.toLocaleString()} approved by ${processorName}.${repaymentNote}${debtNote}${prepaidNote}`,
            type: "success",
            metadata: {
              deposit_request_id: depositRequest.id,
              amount: depositRequest.amount,
              repayment_applied: repaymentApplied,
              debt_cleared: debtCleared,
              days_prepaid: daysPrepaid,
              prepaid_amount: prepaidAmount,
            },
          });

          // Audit
          await supabaseAdmin.from("audit_logs").insert({
            action_type: "approve",
            table_name: "deposit_requests",
            record_id: depositRequest.id,
            performed_by: user.id,
            old_values: { status: "pending" },
            new_values: { status: "approved" },
            metadata: { amount: depositRequest.amount, repayment_applied: repaymentApplied, debt_cleared: debtCleared, days_prepaid: daysPrepaid, prepaid_amount: prepaidAmount },
          });

          results.push({ id: depositRequest.id, status: "approved", amount: depositRequest.amount, user_id: depositRequest.user_id, repayment_applied: repaymentApplied, debt_cleared: debtCleared, days_prepaid: daysPrepaid });
        } else {
          // Reject
          await supabaseAdmin
            .from("deposit_requests")
            .update({
              status: "rejected",
              rejected_at: new Date().toISOString(),
              rejection_reason: safeRejectionReason || "Rejected by manager",
              processed_by: user.id,
            })
            .eq("id", depositRequest.id);

          await supabaseAdmin.from("notifications").insert({
            user_id: depositRequest.user_id,
            title: "Deposit Rejected ❌",
            message: `Your deposit of UGX ${depositRequest.amount.toLocaleString()} rejected by ${processorName}. Reason: ${safeRejectionReason || "No reason"}`,
            type: "warning",
            metadata: { deposit_request_id: depositRequest.id, amount: depositRequest.amount, reason: safeRejectionReason },
          });

          await supabaseAdmin.from("audit_logs").insert({
            action_type: "reject",
            table_name: "deposit_requests",
            record_id: depositRequest.id,
            performed_by: user.id,
            old_values: { status: "pending" },
            new_values: { status: "rejected" },
            reason: safeRejectionReason || "Rejected by manager",
            metadata: { amount: depositRequest.amount },
          });

          results.push({ id: depositRequest.id, status: "rejected", amount: depositRequest.amount, user_id: depositRequest.user_id });
        }
      } catch (innerErr) {
        console.error(`[approve-deposit] Error processing ${depositRequest.id}:`, innerErr);
        results.push({ id: depositRequest.id, status: "error", amount: depositRequest.amount, user_id: depositRequest.user_id });
      }
    }

    console.log(`[approve-deposit] ${processorName} ${action}d ${results.filter(r => r.status !== 'error').length}/${depositRequests.length} deposits`);

    // Log system events for each processed deposit
    for (const r of results) {
      if (r.status !== 'error') {
        logSystemEvent(supabaseAdmin, action === 'approve' ? 'deposit_approved' : 'deposit_rejected', user.id, 'deposit_requests', r.id, { amount: r.amount, user_id: r.user_id });
      }
    }


    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ title: "💰 Deposit Processed", body: "Activity: deposit", url: "/manager" }),
    }).catch(() => {});

    // Push notification to each approved user (fire-and-forget)
    for (const r of results) {
      if (r.status === "approved") {
        fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({
            userIds: [r.user_id],
            payload: { title: "✅ Deposit Approved", body: `Your deposit of UGX ${r.amount.toLocaleString()} has been approved`, url: "/dashboard", type: "success" },
          }),
        }).catch(() => {});
      }
    }


    return new Response(
      JSON.stringify({
        success: true,
        message: `${results.filter(r => r.status !== 'error').length} deposit(s) ${action}d`,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Unexpected error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
