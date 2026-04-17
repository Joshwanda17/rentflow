import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authenticate caller
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller role (staff OR active cashout agent)
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const allowedRoles = ["super_admin", "manager", "cfo", "coo", "operations", "cto"];
    const hasStaffRole = (roles || []).some((r: any) => allowedRoles.includes(r.role));

    // Also check if caller is an active cashout agent
    let isCashoutAgent = false;
    if (!hasStaffRole) {
      const { data: agentRow } = await admin
        .from("cashout_agents")
        .select("id")
        .eq("agent_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      isCashoutAgent = !!agentRow;
    }

    if (!hasStaffRole && !isCashoutAgent) {
      return new Response(JSON.stringify({ error: "Forbidden: insufficient role" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body
    const body = await req.json();
    const { withdrawal_id, reference, payment_method } = body;

    if (!withdrawal_id || typeof withdrawal_id !== "string") {
      return new Response(JSON.stringify({ error: "withdrawal_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!reference || typeof reference !== "string" || reference.trim().length < 3) {
      return new Response(JSON.stringify({ error: "reference (TID/bank ref) must be at least 3 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!payment_method || typeof payment_method !== "string") {
      return new Response(JSON.stringify({ error: "payment_method is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch withdrawal request (fresh from DB — never trust cache)
    const { data: wr, error: wrErr } = await admin
      .from("withdrawal_requests")
      .select("*")
      .eq("id", withdrawal_id)
      .single();

    if (wrErr || !wr) {
      return new Response(JSON.stringify({ error: "Withdrawal request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only allow approval of pending/requested/manager_approved/rejected (re-approval)
    const approvableStatuses = ["pending", "requested", "manager_approved", "rejected"];
    if (!approvableStatuses.includes(wr.status)) {
      return new Response(JSON.stringify({ error: `Cannot approve: withdrawal is already '${wr.status}'` }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Proxy payouts are requested by the agent and funded from the agent wallet.
    // `linked_party` identifies the partner receiving the external payout.
    const isProxyPayout =
      typeof wr.reason === "string" &&
      wr.reason.startsWith("Proxy payout delivery for") &&
      wr.linked_party &&
      wr.linked_party !== wr.user_id;

    const fundingUserId = wr.user_id;
    const beneficiaryUserId = isProxyPayout ? wr.linked_party : wr.user_id;
    const amount = Number(wr.amount);

    console.log(
      `[approve-withdrawal] withdrawal ${withdrawal_id}: isProxyPayout=${isProxyPayout}, ` +
      `submitter=${wr.user_id}, debiting=${fundingUserId}, beneficiary=${beneficiaryUserId}, amount=${amount}`
    );

    // Check wallet balance (from wallets table, which is derived from ledger)
    const { data: wallet } = await admin
      .from("wallets")
      .select("balance")
      .eq("user_id", fundingUserId)
      .single();

    // Check if there's already a pending hold (pre-deduction) for this withdrawal
    // This happens when agents submit proxy withdrawals — they pre-deduct via a
    // 'withdrawal_pending' ledger entry. We must credit that back before re-checking.
    const { data: pendingHolds } = await admin
      .from("general_ledger")
      .select("id, amount")
      .eq("source_table", "withdrawal_requests")
      .eq("source_id", withdrawal_id)
      .eq("category", "withdrawal_pending")
      .eq("direction", "cash_out");

    const totalPendingHold = (pendingHolds || []).reduce((sum: number, h: any) => sum + Number(h.amount), 0);
    const effectiveBalance = (wallet?.balance || 0) + totalPendingHold;

    // For direct agent withdrawals, check commission-aware withdrawable balance.
    // Skip this for proxy payouts because they are partner funds routed through the agent wallet.
    const { data: agentRole } = isProxyPayout
      ? { data: null as any }
      : await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", fundingUserId)
          .eq("role", "agent")
          .maybeSingle();

    let withdrawableBalance = effectiveBalance;

    if (agentRole) {
      // Use split balance RPC to get the withdrawable (commission) portion.
      // This is derived from the ledger and includes CFO direct transfers — it is
      // the source of truth, not the (possibly stale) wallets.balance cache.
      const { data: splitBalances } = await admin.rpc("get_agent_split_balances", {
        p_agent_id: fundingUserId,
      });
      const balRow = Array.isArray(splitBalances) ? splitBalances[0] : splitBalances;
      const commissionBalance = Number(balRow?.commission_balance ?? 0);

      // Trust the ledger-derived withdrawable balance directly (do NOT cap with the
      // stale wallets.balance cache, which can lag behind direct ledger inserts).
      withdrawableBalance = commissionBalance + totalPendingHold;

      // Soft check: if agent has high outstanding float, warn but allow
      const { data: outstandingRows } = await admin.rpc("get_outstanding_agent_float");
      const agentFloat = (outstandingRows || []).find((r: any) => r.agent_id === fundingUserId);
      const outstandingFloat = Number(agentFloat?.outstanding ?? 0);
      const ageHours = Number(agentFloat?.age_hours ?? 0);

      // If agent has overdue float (>72h), block commission withdrawal entirely
      if (outstandingFloat > 0 && ageHours > 72) {
        return new Response(
          JSON.stringify({
            error: `Commission withdrawal blocked: you have UGX ${outstandingFloat.toLocaleString()} in unsettled float outstanding for ${Math.floor(ageHours)}h. Please settle landlord deliveries first.`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!wallet || withdrawableBalance < amount) {
      const errorMsg = agentRole
        ? `Cannot approve: agent's withdrawable commission is only UGX ${withdrawableBalance.toLocaleString()}, but they requested UGX ${amount.toLocaleString()}. The remaining balance is company float (locked) and cannot be withdrawn. Please reject this request.`
        : `Insufficient wallet balance. Available: UGX ${withdrawableBalance.toLocaleString()}, requested: UGX ${amount.toLocaleString()}.`;
      return new Response(
        JSON.stringify({ error: errorMsg, code: "INSUFFICIENT_WITHDRAWABLE" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Reverse the pending hold entries so the final withdrawal entry is the sole deduction
    if (pendingHolds && pendingHolds.length > 0) {
      for (const hold of pendingHolds) {
        await admin.from("general_ledger").delete().eq("id", hold.id);
      }
    }

    // Get beneficiary profile for audit / notifications
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, phone")
      .eq("id", beneficiaryUserId)
      .single();
    const targetName = profile?.full_name || "Unknown";

    // Create balanced ledger entries via RPC
    const idempotencyKey = `approve-withdrawal-${withdrawal_id}`;
    const { data: txnGroupId, error: ledgerErr } = await admin.rpc("create_ledger_transaction", {
      entries: [
        {
          user_id: fundingUserId,
          amount,
          direction: "cash_out",
          category: "wallet_withdrawal",
          ledger_scope: "wallet",
          description: `Wallet withdrawal approved – ${payment_method} ref: ${reference.trim().toUpperCase()}`,
          currency: "UGX",
          source_table: "withdrawal_requests",
          source_id: withdrawal_id,
          transaction_date: new Date().toISOString(),
          linked_party: user.id,
        },
        {
          direction: "cash_in",
          amount,
          category: "wallet_withdrawal",
          ledger_scope: "platform",
          description: `Platform records withdrawal payout – ${payment_method} ref: ${reference.trim().toUpperCase()}`,
          currency: "UGX",
          source_table: "withdrawal_requests",
          source_id: withdrawal_id,
          transaction_date: new Date().toISOString(),
        },
      ],
    });

    if (ledgerErr) {
      console.error("[approve-withdrawal] Ledger RPC error:", ledgerErr);
      return new Response(JSON.stringify({ error: "Failed to record ledger entry: " + (ledgerErr.message || "unknown") }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update withdrawal request status
    const { error: updateErr } = await admin
      .from("withdrawal_requests")
      .update({
        status: "approved",
        fin_ops_reference: reference.trim().toUpperCase(),
        fin_ops_payment_method: payment_method,
        fin_ops_approved_at: new Date().toISOString(),
        fin_ops_approved_by: user.id,
        fin_ops_verified_by: user.id,
        fin_ops_verified_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
        processed_by: user.id,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", withdrawal_id);

    if (updateErr) {
      console.error("[approve-withdrawal] Update error:", updateErr);
      // Ledger entry already exists — log but don't fail the user
    }

    // Audit log
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action_type: "withdrawal_approved_ledger",
      record_id: withdrawal_id,
      table_name: "withdrawal_requests",
      metadata: {
        amount,
        target_user: beneficiaryUserId,
        target_user_name: targetName,
        reference: reference.trim().toUpperCase(),
        payment_method,
        txn_group_id: txnGroupId,
        previous_balance: effectiveBalance,
        new_balance: effectiveBalance - amount,
        pending_hold_reversed: totalPendingHold,
      },
    });

    // Cashout agent 1% commission (only when caller is a non-staff cashout agent)
    let cashoutCommission = 0;
    if (isCashoutAgent && !hasStaffRole) {
      cashoutCommission = Math.round(amount * 0.01);
      if (cashoutCommission > 0) {
        try {
          const txDate = new Date().toISOString();
          const { error: commErr } = await admin.rpc("create_ledger_transaction", {
            entries: [
              {
                user_id: user.id, ledger_scope: "platform", direction: "cash_out",
                amount: cashoutCommission, category: "agent_commission_earned",
                source_table: "withdrawal_requests", source_id: withdrawal_id,
                description: `Cashout payout commission expense (1%) for withdrawal ${withdrawal_id}`,
                currency: "UGX", reference_id: `${withdrawal_id}-cashout-commission`, transaction_date: txDate,
              },
              {
                user_id: user.id, ledger_scope: "wallet", direction: "cash_in",
                amount: cashoutCommission, category: "agent_commission_earned",
                source_table: "withdrawal_requests", source_id: withdrawal_id,
                description: `Cashout payout commission (1%) for withdrawal ${withdrawal_id}`,
                currency: "UGX", reference_id: `${withdrawal_id}-cashout-commission`, transaction_date: txDate,
              },
            ],
          });
          if (commErr) {
            console.error("[approve-withdrawal] Cashout commission RPC error:", commErr);
            cashoutCommission = 0;
          }
        } catch (e) {
          console.error("[approve-withdrawal] Cashout commission exception:", e);
          cashoutCommission = 0;
        }
      }
    }

    const notifyUserIds = [...new Set([fundingUserId, beneficiaryUserId].filter((value): value is string => Boolean(value)))];

    // Notify user (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        userIds: notifyUserIds,
        payload: {
          title: "✅ Withdrawal Approved",
          body: `UGX ${amount.toLocaleString()} has been sent to you via ${payment_method}`,
          url: "/dashboard",
          type: "success",
        },
      }),
    }).catch(() => {});

    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        title: "✅ Withdrawal Approved",
        body: `${targetName} – UGX ${amount.toLocaleString()} via ${payment_method}`,
        url: "/manager",
      }),
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        withdrawal_id,
        amount,
        previous_balance: effectiveBalance,
        new_balance: effectiveBalance - amount,
        target_user: targetName,
        txn_group_id: txnGroupId,
        cashout_commission: cashoutCommission,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[approve-withdrawal] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
