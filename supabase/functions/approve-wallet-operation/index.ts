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
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub as string;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify manager role
    const { data: managerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "manager")
      .maybeSingle();

    if (!managerRole) {
      return new Response(
        JSON.stringify({ error: "Only managers can approve wallet operations" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { operation_id, action, rejection_reason, bulk_ids, display_currency } = body as {
      operation_id?: string;
      action: "approve" | "reject";
      rejection_reason?: string;
      bulk_ids?: string[];
      display_currency?: string;
    };

    // Validate action
    if (action !== "approve" && action !== "reject") {
      return new Response(
        JSON.stringify({ error: "Invalid action. Must be 'approve' or 'reject'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate rejection_reason length
    if (rejection_reason && typeof rejection_reason === "string" && rejection_reason.length > 1000) {
      return new Response(
        JSON.stringify({ error: "Rejection reason must be under 1000 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate bulk_ids size limit
    if (bulk_ids && Array.isArray(bulk_ids) && bulk_ids.length > 100) {
      return new Response(
        JSON.stringify({ error: "Cannot process more than 100 operations at once" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const idsToProcess = bulk_ids || (operation_id ? [operation_id] : []);

    if (idsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ error: "No operation IDs provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reject" && !rejection_reason) {
      return new Response(
        JSON.stringify({ error: "Rejection reason required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch pending operations
    const { data: operations, error: fetchErr } = await adminClient
      .from("pending_wallet_operations")
      .select("*")
      .in("id", idsToProcess)
      .eq("status", "pending");

    if (fetchErr || !operations || operations.length === 0) {
      return new Response(
        JSON.stringify({ error: "No pending operations found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{ id: string; status: string; user_id: string; amount: number }> = [];

    for (const op of operations) {
      if (action === "approve") {
        // Ensure transaction_group_id is always set so sync_wallet_from_ledger trigger fires
        const effectiveTxGroupId = op.transaction_group_id || crypto.randomUUID();

        // Insert into general_ledger (this triggers wallet balance update via existing trigger)
        const { error: ledgerErr } = await adminClient
          .from("general_ledger")
          .insert({
            user_id: op.user_id,
            amount: op.amount,
            direction: op.direction,
            category: op.category,
            description: op.description,
            source_table: op.source_table,
            source_id: op.source_id,
            transaction_group_id: effectiveTxGroupId,
            linked_party: op.linked_party,
            reference_id: op.reference_id,
            account: op.account,
          });

        if (ledgerErr) {
          console.error(`[approve-wallet-op] Ledger insert failed for ${op.id}:`, ledgerErr);
          continue;
        }

        // If this is an agent rent payment for a tenant, update receivables
        if (op.category === 'rent_payment_for_tenant' && op.direction === 'cash_in' && op.user_id) {
          // The cash_in direction means tenant wallet was credited — update their rent repayment
          try {
            await adminClient.rpc("record_rent_request_repayment", {
              p_tenant_id: op.user_id,
              p_amount: op.amount,
            });
            console.log(`[approve-wallet-op] Updated receivables for tenant ${op.user_id}, amount: ${op.amount}`);
          } catch (rpcErr) {
            console.error(`[approve-wallet-op] Failed to update receivables for ${op.id}:`, rpcErr);
          }
        }

        // ── Auto-deduct rent repayment for ANY cash_in deposit (wallet_deposit, etc.) ──
        // When a user deposits money and has an active rent request, auto-deduct outstanding rent
        if (op.direction === 'cash_in' && op.user_id && op.category !== 'rent_payment_for_tenant' && op.category !== 'supporter_facilitation_capital') {
          try {
            // Check for active rent request
            const { data: activeRentRequest } = await adminClient
              .from("rent_requests")
              .select("id, total_repayment, amount_repaid, status")
              .eq("tenant_id", op.user_id)
              .in("status", ["funded", "disbursed", "approved"])
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (activeRentRequest) {
              const outstanding = Number(activeRentRequest.total_repayment) - Number(activeRentRequest.amount_repaid);

              if (outstanding > 0) {
                // Re-read wallet balance after the ledger credit (trigger may have updated it)
                const { data: freshWallet } = await adminClient
                  .from("wallets")
                  .select("balance")
                  .eq("user_id", op.user_id)
                  .single();

                const availableBalance = freshWallet?.balance || 0;

                if (availableBalance > 0) {
                  const repaymentAmount = Math.min(availableBalance, outstanding);

                  // Record repayment via RPC
                  const { error: repaymentErr } = await adminClient.rpc(
                    "record_rent_request_repayment",
                    { p_tenant_id: op.user_id, p_amount: repaymentAmount }
                  );

                  if (!repaymentErr) {
                    // Insert cash_out ledger entry → trigger auto-deducts from wallet
                    const txGroupId = crypto.randomUUID();
                    await adminClient.from("general_ledger").insert({
                      user_id: op.user_id,
                      amount: repaymentAmount,
                      direction: "cash_out",
                      category: "rent_repayment",
                      source_table: "pending_wallet_operations",
                      source_id: op.id,
                      reference_id: op.reference_id || op.id,
                      transaction_group_id: txGroupId,
                      description: `Auto rent deduction from wallet deposit (Ref: ${op.reference_id || 'N/A'})`,
                      linked_party: activeRentRequest.id,
                      transaction_date: new Date().toISOString(),
                    });

                    const newOutstanding = outstanding - repaymentAmount;
                    console.log(`[approve-wallet-op] Auto-deducted UGX ${repaymentAmount} for rent repayment. Remaining: ${newOutstanding}. Tenant: ${op.user_id}`);

                    // Notify tenant
                    await adminClient.from("notifications").insert({
                      user_id: op.user_id,
                      title: "Rent Auto-Deducted 🏠",
                      message: `UGX ${repaymentAmount.toLocaleString()} auto-deducted for rent repayment from your deposit. Outstanding: UGX ${newOutstanding.toLocaleString()}.`,
                      type: "info",
                    });
                  } else {
                    console.error(`[approve-wallet-op] Rent repayment RPC failed for ${op.user_id}:`, repaymentErr.message);
                  }
                }
              }
            }
          } catch (rentErr) {
            console.error(`[approve-wallet-op] Auto-deduction error for ${op.id}:`, rentErr);
          }
        }

        // If this is a supporter_facilitation_capital approval, activate the linked portfolio
        let portfolioInvestorId: string | null = null;
        if (op.category === 'supporter_facilitation_capital' && op.source_table === 'investor_portfolios' && op.source_id) {
          // Fetch the portfolio to get the actual investor_id (funder)
          const { data: portfolioData } = await adminClient
            .from("investor_portfolios")
            .select("investor_id, agent_id, portfolio_code")
            .eq("id", op.source_id)
            .single();

          portfolioInvestorId = portfolioData?.investor_id || null;

          const updatePayload: Record<string, any> = { status: "active" };
          if (display_currency) {
            updatePayload.display_currency = display_currency;
          }

          const { error: portfolioActivateErr } = await adminClient
            .from("investor_portfolios")
            .update(updatePayload)
            .eq("id", op.source_id)
            .eq("status", "pending_approval");
          if (portfolioActivateErr) {
            console.error(`[approve-wallet-op] Failed to activate portfolio ${op.source_id}:`, portfolioActivateErr);
          } else {
            console.log(`[approve-wallet-op] Activated portfolio ${op.source_id} for investor ${portfolioInvestorId}`);

            // ── 2% Investment Commission for the facilitating agent ──
            if (portfolioData?.agent_id) {
              const commissionAmount = Math.round(op.amount * 0.02);
              if (commissionAmount > 0) {
                // Record in agent_earnings
                const { error: commErr } = await adminClient
                  .from("agent_earnings")
                  .insert({
                    agent_id: portfolioData.agent_id,
                    amount: commissionAmount,
                    earning_type: "investment_commission",
                    description: `2% investment commission on UGX ${op.amount.toLocaleString()} activation (${portfolioData.portfolio_code || ''})`,
                    source_user_id: portfolioInvestorId,
                    rent_request_id: null,
                  });
                if (commErr) {
                  console.error(`[approve-wallet-op] Failed to record investment commission:`, commErr);
                } else {
                  // Credit agent wallet via ledger
                  const commTxGroupId = crypto.randomUUID();
                  await adminClient.from("general_ledger").insert({
                    user_id: portfolioData.agent_id,
                    amount: commissionAmount,
                    direction: "cash_in",
                    category: "agent_investment_commission",
                    description: `2% commission on investment activation ${portfolioData.portfolio_code || ''}`,
                    source_table: "agent_earnings",
                    source_id: op.source_id,
                    transaction_group_id: commTxGroupId,
                    linked_party: portfolioInvestorId || "Partner",
                    reference_id: op.reference_id,
                  });
                  console.log(`[approve-wallet-op] Credited agent ${portfolioData.agent_id} with ${commissionAmount} investment commission`);
                }
              }
            }
          }

          // Determine the correct user for ledger entries (the funder, not the agent)
          const funderId = portfolioInvestorId || op.user_id;

          // Immediately debit wallet → investment (net zero wallet impact)
          const investTxGroupId = crypto.randomUUID();
          const { error: investDebitErr } = await adminClient
            .from("general_ledger")
            .insert({
              user_id: funderId,
              amount: op.amount,
              direction: "cash_out",
              category: "wallet_to_investment",
              description: `Capital invested into portfolio ${portfolioData?.portfolio_code || ''}. Ref: ${op.reference_id}`,
              source_table: "investor_portfolios",
              source_id: op.source_id,
              transaction_group_id: investTxGroupId,
              linked_party: "Rent Management Pool",
              reference_id: op.reference_id,
            });
          if (investDebitErr) {
            console.error(`[approve-wallet-op] Failed to debit wallet for investment ${op.id}:`, investDebitErr);
          } else {
            console.log(`[approve-wallet-op] Debited wallet → investment for funder ${funderId}, amount: ${op.amount}`);
          }
        }

        // Mark as approved
        await adminClient
          .from("pending_wallet_operations")
          .update({
            status: "approved",
            reviewed_by: userId,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", op.id);

        // Notify the correct user(s)
        if (op.category === 'supporter_facilitation_capital' && portfolioInvestorId) {
          // Notify the FUNDER (investor)
          await adminClient.from("notifications").insert({
            user_id: portfolioInvestorId,
            title: "Investment Activated ✅",
            message: `Your UGX ${op.amount.toLocaleString()} investment has been approved and is now active. Monthly rewards will begin within 30 days.`,
            type: "success",
            metadata: { operation_id: op.id, amount: op.amount, direction: op.direction },
          });

          // Also notify the AGENT who facilitated it
          if (op.user_id !== portfolioInvestorId) {
            await adminClient.from("notifications").insert({
              user_id: op.user_id,
              title: "Partner Investment Approved ✅",
              message: `UGX ${op.amount.toLocaleString()} investment you facilitated has been approved and activated.`,
              type: "success",
              metadata: { operation_id: op.id, amount: op.amount },
            });
          }
        } else {
          // Standard notification for non-investment operations
          const notifTitle = op.direction === "cash_in" ? "Wallet Credited ✅" : "Wallet Debited ✅";
          await adminClient.from("notifications").insert({
            user_id: op.user_id,
            title: notifTitle,
            message: `UGX ${op.amount.toLocaleString()} - ${op.description || op.category}. Approved by admin.`,
            type: "success",
            metadata: { operation_id: op.id, amount: op.amount, direction: op.direction },
          });
        }

        results.push({ id: op.id, status: "approved", user_id: op.user_id, amount: op.amount });
      } else {
        // Reject
        await adminClient
          .from("pending_wallet_operations")
          .update({
            status: "rejected",
            reviewed_by: userId,
            reviewed_at: new Date().toISOString(),
            rejection_reason: rejection_reason,
            updated_at: new Date().toISOString(),
          })
          .eq("id", op.id);

        // If rejecting a supporter_facilitation_capital, cancel portfolio and restore agent wallet
        if (op.category === 'supporter_facilitation_capital' && op.source_table === 'investor_portfolios' && op.source_id) {
          // Cancel the portfolio
          await adminClient
            .from("investor_portfolios")
            .update({ status: "cancelled" })
            .eq("id", op.source_id)
            .eq("status", "pending_approval");

          // Find the agent who funded this and restore their wallet
          const { data: portfolio } = await adminClient
            .from("investor_portfolios")
            .select("agent_id, investment_amount")
            .eq("id", op.source_id)
            .single();

          if (portfolio) {
            // Restore agent wallet balance
            const { data: agentWallet } = await adminClient
              .from("wallets")
              .select("balance")
              .eq("user_id", portfolio.agent_id)
              .single();

            if (agentWallet) {
              await adminClient
                .from("wallets")
                .update({
                  balance: agentWallet.balance + portfolio.investment_amount,
                  updated_at: new Date().toISOString(),
                })
                .eq("user_id", portfolio.agent_id);

              console.log(`[approve-wallet-op] Restored UGX ${portfolio.investment_amount} to agent ${portfolio.agent_id}`);

              // Notify agent of refund
              await adminClient.from("notifications").insert({
                user_id: portfolio.agent_id,
                title: "💰 Investment Refunded",
                message: `Your proxy investment of UGX ${portfolio.investment_amount.toLocaleString()} was rejected. Funds have been restored to your wallet. Reason: ${rejection_reason}`,
                type: "warning",
                metadata: { operation_id: op.id, amount: portfolio.investment_amount, reason: rejection_reason },
              });
            }
          }
        }

        // Notify user
        await adminClient.from("notifications").insert({
          user_id: op.user_id,
          title: "Transaction Rejected ❌",
          message: `UGX ${op.amount.toLocaleString()} - ${op.description || op.category}. Reason: ${rejection_reason}`,
          type: "warning",
          metadata: { operation_id: op.id, amount: op.amount, reason: rejection_reason },
        });

        results.push({ id: op.id, status: "rejected", user_id: op.user_id, amount: op.amount });
      }
    }

    console.log(`[approve-wallet-op] Manager ${userId} ${action}d ${results.length} operations`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `${results.length} operation(s) ${action}d`,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[approve-wallet-op] Error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
