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

    // Verify authorized role
    const allowedRoles = ['manager', 'coo', 'cfo', 'cto', 'super_admin'];
    const { data: userRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", allowedRoles);

    if (!userRoles || userRoles.length === 0) {
      return new Response(
        JSON.stringify({ error: "You do not have permission to approve wallet operations" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { operation_id, action, rejection_reason, bulk_ids, display_currency, payment_method, payment_reference } = body as {
      operation_id?: string;
      action: "approve" | "reject";
      rejection_reason?: string;
      bulk_ids?: string[];
      display_currency?: string;
      payment_method?: string;
      payment_reference?: string;
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
    const failedResults: Array<{ id: string; error: string }> = [];

    for (const op of operations) {
      if (action === "approve") {
        // Ensure transaction_group_id is always set so sync_wallet_from_ledger trigger fires
        const effectiveTxGroupId = op.transaction_group_id || crypto.randomUUID();

        // Determine target wallet: if managed payout, route to agent's wallet
        const ledgerUserId = op.target_wallet_user_id || op.user_id;
        const isManaged = !!op.target_wallet_user_id && op.target_wallet_user_id !== op.user_id;

        // Insert into general_ledger (this triggers wallet balance update via existing trigger)
        // Determine ledger_scope based on category
        const PLATFORM_CATEGORIES = [
          'tenant_access_fee', 'tenant_request_fee', 'platform_service_income',
          'landlord_platform_fee', 'management_fee', 'roi_payout',
          'supporter_platform_rewards', 'agent_commission_payout',
          'transaction_platform_expenses', 'operational_expenses',
          'agent_requisition', 'salary_payment', 'employee_advance',
          'platform_expense_disbursement',
        ];
        const BRIDGE_CATEGORIES = ['supporter_facilitation_capital', 'wallet_to_investment'];
        const scopeForCategory = PLATFORM_CATEGORIES.includes(op.category)
          ? 'platform'
          : BRIDGE_CATEGORIES.includes(op.category)
            ? 'bridge'
            : 'wallet';

        // Insert into general_ledger via RPC
        const { data: rpcTxGroupId, error: ledgerErr } = await adminClient.rpc('create_ledger_transaction', {
          entries: [
            {
              user_id: ledgerUserId,
              amount: op.amount,
              direction: op.direction,
              category: op.category === 'supporter_platform_rewards' ? 'roi_wallet_credit'
                : op.category === 'roi_payout' ? 'roi_wallet_credit'
                : op.category === 'agent_commission_payout' ? 'agent_commission_earned'
                : op.category === 'platform_expense_disbursement' ? 'system_balance_correction'
                : op.category === 'salary_payment' ? 'system_balance_correction'
                : op.category === 'employee_advance' ? 'system_balance_correction'
                : op.category === 'agent_requisition' ? 'system_balance_correction'
                : op.category === 'supporter_facilitation_capital' ? 'partner_funding'
                : op.category === 'wallet_to_investment' ? 'partner_funding'
                : op.category === 'rent_payment_for_tenant' ? 'agent_float_used_for_rent'
                : op.category,
              ledger_scope: scopeForCategory,
              description: isManaged
                ? `[Managed Payout] ${op.description || ''} — on behalf of partner ${op.user_id}`
                : op.description,
              source_table: op.source_table,
              source_id: op.source_id,
              linked_party: isManaged ? op.user_id : op.linked_party,
              reference_id: op.reference_id,
              account: op.account,
              currency: 'UGX',
              transaction_date: new Date().toISOString(),
            },
            {
              direction: op.direction === 'cash_in' ? 'cash_out' : 'cash_in',
              amount: op.amount,
              category: op.category === 'supporter_platform_rewards' ? 'roi_expense'
                : op.category === 'roi_payout' ? 'roi_expense'
                : op.category === 'supporter_facilitation_capital' ? 'partner_funding'
                : 'system_balance_correction',
              ledger_scope: 'platform',
              description: `Platform contra for ${op.category}`,
              source_table: op.source_table,
              source_id: op.source_id,
              currency: 'UGX',
              transaction_date: new Date().toISOString(),
            },
          ],
        });

        if (ledgerErr) {
          console.error(`[approve-wallet-op] Ledger insert failed for ${op.id}:`, ledgerErr);
          failedResults.push({ id: op.id, error: ledgerErr.message || 'Ledger insert failed' });
          continue;
        }

        // ── Advance next_roi_date on ROI payout approval ──
        if ((op.category === 'roi_payout' || op.category === 'supporter_platform_rewards') && op.source_table === 'investor_portfolios' && op.source_id) {
          try {
            // Get current next_roi_date to advance from it (not from today)
            const { data: portfolio } = await adminClient
              .from('investor_portfolios')
              .select('next_roi_date, created_at, payout_day')
              .eq('id', op.source_id)
              .single();

            if (portfolio) {
              const currentDate = portfolio.next_roi_date
                ? new Date(portfolio.next_roi_date + 'T00:00:00')
                : new Date(portfolio.created_at);
              const nextDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate());
              const nextDateStr = nextDate.toISOString().split('T')[0];

              await adminClient
                .from('investor_portfolios')
                .update({ next_roi_date: nextDateStr })
                .eq('id', op.source_id);

              console.log(`[approve-wallet-op] Advanced next_roi_date for portfolio ${op.source_id} to ${nextDateStr}`);
            }
          } catch (dateErr) {
            console.error(`[approve-wallet-op] Failed to advance next_roi_date for portfolio ${op.source_id}:`, dateErr);
          }
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

        // ── Priority 1: Auto-deduct advance repayment (proportional — 30% of deposit) ──
        // Takes a proportion of the deposit toward active/overdue advances before rent
        if (op.direction === 'cash_in' && op.user_id && op.category !== 'supporter_facilitation_capital') {
          try {
            const ADVANCE_REPAYMENT_RATIO = 0.30; // 30% of deposit goes to advance repayment

            const { data: activeAdvances } = await adminClient
              .from("agent_advances")
              .select("id, agent_id, outstanding_balance, daily_rate, principal, status")
              .eq("agent_id", op.user_id)
              .in("status", ["active", "overdue"])
              .gt("outstanding_balance", 0)
              .order("created_at", { ascending: true });

            if (activeAdvances && activeAdvances.length > 0) {
              const { data: advWallet } = await adminClient
                .from("wallets")
                .select("balance")
                .eq("user_id", op.user_id)
                .single();

              const walletBalance = advWallet?.balance || 0;
              let advanceBudget = Math.min(Math.floor(op.amount * ADVANCE_REPAYMENT_RATIO), walletBalance);
              let remainingBudget = advanceBudget;

              for (const advance of activeAdvances) {
                if (remainingBudget <= 0) break;

                const deductAmount = Math.min(remainingBudget, Number(advance.outstanding_balance));
                if (deductAmount <= 0) continue;

                const advTxGroupId = crypto.randomUUID();
                const today = new Date().toISOString().split('T')[0];

                const { error: advLedgerErr } = await adminClient.rpc('create_ledger_transaction', {
                  entries: [
                    {
                      user_id: op.user_id,
                      amount: deductAmount,
                      direction: 'cash_out',
                      category: 'agent_repayment',
                      ledger_scope: 'wallet',
                      source_table: 'agent_advances',
                      source_id: advance.id,
                      description: `Auto advance repayment (${Math.round(ADVANCE_REPAYMENT_RATIO * 100)}% of deposit) from wallet deposit (Ref: ${op.reference_id || op.id})`,
                      reference_id: op.id,
                      currency: 'UGX',
                      transaction_date: new Date().toISOString(),
                    },
                    {
                      direction: 'cash_in',
                      amount: deductAmount,
                      category: 'agent_repayment',
                      ledger_scope: 'platform',
                      source_table: 'agent_advances',
                      source_id: advance.id,
                      description: `Platform receives advance repayment`,
                      currency: 'UGX',
                      transaction_date: new Date().toISOString(),
                    },
                  ],
                });

                if (advLedgerErr) {
                  console.error(`[approve-wallet-op] Advance ledger insert failed for advance ${advance.id}:`, advLedgerErr);
                  continue;
                }

                const newOutstanding = Number(advance.outstanding_balance) - deductAmount;
                const newStatus = newOutstanding <= 0 ? "completed" : advance.status;

                await adminClient
                  .from("agent_advances")
                  .update({
                    outstanding_balance: Math.max(0, newOutstanding),
                    status: newStatus,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", advance.id);

                await adminClient
                  .from("agent_advance_ledger")
                  .insert({
                    advance_id: advance.id,
                    date: today,
                    opening_balance: Number(advance.outstanding_balance),
                    amount_deducted: deductAmount,
                    interest_accrued: 0,
                    closing_balance: Math.max(0, newOutstanding),
                    deduction_status: "success",
                  });

                remainingBudget -= deductAmount;

                console.log(`[approve-wallet-op] Auto-deducted UGX ${deductAmount} (${Math.round(ADVANCE_REPAYMENT_RATIO * 100)}% proportion) for advance ${advance.id}. Remaining advance: ${Math.max(0, newOutstanding)}. User: ${op.user_id}`);

                await adminClient.from("notifications").insert({
                  user_id: op.user_id,
                  title: "Advance Auto-Deducted 💳",
                  message: `UGX ${deductAmount.toLocaleString()} (${Math.round(ADVANCE_REPAYMENT_RATIO * 100)}% of deposit) auto-deducted for advance repayment. Outstanding: UGX ${Math.max(0, newOutstanding).toLocaleString()}.`,
                  type: "info",
                });
              }
            }
          } catch (advErr) {
            console.error(`[approve-wallet-op] Advance auto-deduction error for ${op.id}:`, advErr);
          }
        }

        // ── Priority 2: Auto-deduct rent repayment from remaining balance ──
        // When a user deposits money and has an active rent request, auto-deduct outstanding rent
        if (op.direction === 'cash_in' && op.user_id && op.category !== 'rent_payment_for_tenant' && op.category !== 'supporter_facilitation_capital') {
          try {
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
                const { data: freshWallet } = await adminClient
                  .from("wallets")
                  .select("balance")
                  .eq("user_id", op.user_id)
                  .single();

                const availableBalance = freshWallet?.balance || 0;

                if (availableBalance > 0) {
                  const repaymentAmount = Math.min(availableBalance, outstanding);

                  const { error: repaymentErr } = await adminClient.rpc(
                    "record_rent_request_repayment",
                    { p_tenant_id: op.user_id, p_amount: repaymentAmount }
                  );

                  if (!repaymentErr) {
                    const { error: rentLedgerErr } = await adminClient.rpc('create_ledger_transaction', {
                      entries: [
                        {
                          user_id: op.user_id,
                          amount: repaymentAmount,
                          direction: 'cash_out',
                          category: 'tenant_repayment',
                          ledger_scope: 'wallet',
                          source_table: 'pending_wallet_operations',
                          source_id: op.id,
                          reference_id: op.reference_id || op.id,
                          description: `Auto rent deduction from wallet deposit (Ref: ${op.reference_id || 'N/A'})`,
                          currency: 'UGX',
                          linked_party: activeRentRequest.id,
                          transaction_date: new Date().toISOString(),
                        },
                        {
                          direction: 'cash_in',
                          amount: repaymentAmount,
                          category: 'tenant_repayment',
                          ledger_scope: 'platform',
                          source_table: 'pending_wallet_operations',
                          source_id: op.id,
                          description: `Platform receives rent repayment`,
                          currency: 'UGX',
                          transaction_date: new Date().toISOString(),
                        },
                      ],
                    });
                    if (rentLedgerErr) {
                      console.error(`[approve-wallet-op] Rent ledger RPC failed:`, rentLedgerErr.message);
                    }

                    const newOutstanding = outstanding - repaymentAmount;
                    console.log(`[approve-wallet-op] Auto-deducted UGX ${repaymentAmount} for rent repayment. Remaining: ${newOutstanding}. Tenant: ${op.user_id}`);

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
                  // Credit agent wallet via balanced RPC
                  const { error: commLedgerErr } = await adminClient.rpc('create_ledger_transaction', {
                    entries: [
                      {
                        direction: 'cash_out',
                        amount: commissionAmount,
                        category: 'agent_commission_earned',
                        ledger_scope: 'platform',
                        description: `Platform pays 2% commission on investment activation ${portfolioData.portfolio_code || ''}`,
                        currency: 'UGX',
                        source_table: 'agent_earnings',
                        source_id: op.source_id,
                        transaction_date: new Date().toISOString(),
                      },
                      {
                        user_id: portfolioData.agent_id,
                        amount: commissionAmount,
                        direction: 'cash_in',
                        category: 'agent_commission_earned',
                        ledger_scope: 'wallet',
                        description: `2% commission on investment activation ${portfolioData.portfolio_code || ''}`,
                        currency: 'UGX',
                        source_table: 'agent_earnings',
                        source_id: op.source_id,
                        linked_party: portfolioInvestorId || 'Partner',
                        reference_id: op.reference_id,
                        transaction_date: new Date().toISOString(),
                      },
                    ],
                  });
                  if (commLedgerErr) console.error(`[approve-wallet-op] Commission ledger RPC failed:`, commLedgerErr);
                  else console.log(`[approve-wallet-op] Credited agent ${portfolioData.agent_id} with ${commissionAmount} investment commission`);
                }
              }
            }
          }

          // Determine the correct user for ledger entries (the funder, not the agent)
          const funderId = portfolioInvestorId || op.user_id;

          // Immediately debit wallet → investment (net zero wallet impact)
          const investTxGroupId = crypto.randomUUID();
          const { error: investDebitErr } = await adminClient.rpc('create_ledger_transaction', {
            entries: [
              {
                user_id: funderId,
                amount: op.amount,
                direction: 'cash_out',
                category: 'partner_funding',
                ledger_scope: 'wallet',
                description: `Capital invested into portfolio ${portfolioData?.portfolio_code || ''}. Ref: ${op.reference_id}`,
                source_table: 'investor_portfolios',
                source_id: op.source_id,
                linked_party: 'Rent Management Pool',
                reference_id: op.reference_id,
                currency: 'UGX',
                transaction_date: new Date().toISOString(),
              },
              {
                direction: 'cash_in',
                amount: op.amount,
                category: 'partner_funding',
                ledger_scope: 'platform',
                description: `Platform receives investment capital`,
                source_table: 'investor_portfolios',
                source_id: op.source_id,
                currency: 'UGX',
                transaction_date: new Date().toISOString(),
              },
            ],
          });
          if (investDebitErr) {
            console.error(`[approve-wallet-op] Failed to debit wallet for investment ${op.id}:`, investDebitErr);
          } else {
            console.log(`[approve-wallet-op] Debited wallet → investment for funder ${funderId}, amount: ${op.amount}`);
          }
        }

        // Mark as approved with payment details
        await adminClient
          .from("pending_wallet_operations")
          .update({
            status: "approved",
            reviewed_by: userId,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            payment_method: payment_method || null,
            payment_reference: payment_reference || null,
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
        } else if (isManaged) {
          // Managed payout: notify both agent and partner
          await adminClient.from("notifications").insert({
            user_id: ledgerUserId,
            title: "Managed Payout Received ✅",
            message: `UGX ${op.amount.toLocaleString()} credited to your wallet on behalf of a managed partner. Ref: ${op.reference_id || 'N/A'}`,
            type: "success",
            metadata: { operation_id: op.id, amount: op.amount, on_behalf_of: op.user_id },
          });
          await adminClient.from("notifications").insert({
            user_id: op.user_id,
            title: "Payout Processed via Agent ✅",
            message: `Your ROI payout of UGX ${op.amount.toLocaleString()} has been sent to your assigned agent's wallet for collection.`,
            type: "success",
            metadata: { operation_id: op.id, amount: op.amount, agent_id: ledgerUserId },
          });
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
            // Restore agent wallet via ledger reversal (NOT direct wallet update)
            const { error: reversalErr } = await adminClient.rpc('create_ledger_transaction', {
              entries: [
                {
                  user_id: portfolio.agent_id,
                  amount: portfolio.investment_amount,
                  direction: 'cash_in',
                  category: 'system_balance_correction',
                  ledger_scope: 'wallet',
                  description: `Investment rejected — funds restored. Reason: ${rejection_reason}`,
                  source_table: 'investor_portfolios',
                  source_id: op.source_id,
                  currency: 'UGX',
                  transaction_date: new Date().toISOString(),
                },
                {
                  direction: 'cash_out',
                  amount: portfolio.investment_amount,
                  category: 'system_balance_correction',
                  ledger_scope: 'platform',
                  description: `Platform returns rejected investment capital`,
                  source_table: 'investor_portfolios',
                  source_id: op.source_id,
                  currency: 'UGX',
                  transaction_date: new Date().toISOString(),
                },
              ],
            });

            if (!reversalErr) {
              console.log(`[approve-wallet-op] Restored UGX ${portfolio.investment_amount} to agent ${portfolio.agent_id} via ledger`);
            } else {
              console.error(`[approve-wallet-op] Reversal ledger RPC failed:`, reversalErr);
            }

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


    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ title: "✅ Wallet Operation", body: "Activity: wallet operation", url: "/manager" }),
    }).catch(() => {});


    const approved_ids = results.filter(r => r.status === 'approved').map(r => r.id);
    const rejected_ids = results.filter(r => r.status === 'rejected').map(r => r.id);
    const failed_ids = failedResults.map(r => r.id);

    // If nothing succeeded, return an error
    if (results.length === 0 && failedResults.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `All ${failedResults.length} operation(s) failed`,
          failed_ids,
          failures: failedResults,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: results.length > 0,
        message: `${results.length} operation(s) ${action}d` + (failedResults.length > 0 ? `, ${failedResults.length} failed` : ''),
        results,
        approved_ids,
        rejected_ids,
        failed_ids,
        failures: failedResults.length > 0 ? failedResults : undefined,
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
