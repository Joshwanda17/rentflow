import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { checkTreasuryGuard } from "../_shared/treasuryGuard.ts";

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

    // Treasury guard: block withdrawals when paused
    const guardBlock = await checkTreasuryGuard(admin, "debit");
    if (guardBlock) return guardBlock;
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

    // Trust the ledger: reconcile the funding wallet from general_ledger before
    // gating the withdrawal so CFO credits / corrections aren't blocked by stale
    // bucket columns.
    try {
      await admin.rpc("reconcile_wallet_from_ledger", { p_user_id: fundingUserId });
    } catch (reconErr) {
      console.error("[approve-withdrawal] reconcile_wallet_from_ledger failed:", (reconErr as Error).message);
    }

    // 3-BUCKET WALLET MODEL: withdrawals can ONLY draw from withdrawable_balance.
    const { data: wallet } = await admin
      .from("wallets")
      .select("balance, withdrawable_balance, float_balance, advance_balance")
      .eq("user_id", fundingUserId)
      .single();

    // Reverse any pre-existing 'withdrawal_pending' holds for this request before re-checking.
    const { data: pendingHolds } = await admin
      .from("general_ledger")
      .select("id, amount")
      .eq("source_table", "withdrawal_requests")
      .eq("source_id", withdrawal_id)
      .eq("category", "withdrawal_pending")
      .eq("direction", "cash_out");

    const totalPendingHold = (pendingHolds || []).reduce((sum: number, h: any) => sum + Number(h.amount), 0);

    const walletBalance = Number(wallet?.balance ?? 0);
    const walletWithdrawable = Number((wallet as any)?.withdrawable_balance ?? 0);
    const walletFloat = Number((wallet as any)?.float_balance ?? 0);
    const walletAdvance = Number((wallet as any)?.advance_balance ?? 0);

    let healedWithdrawable = walletWithdrawable;

    if (!isProxyPayout && walletWithdrawable + totalPendingHold < amount) {
      const { data: commissionRows, error: commissionErr } = await admin
        .from("general_ledger")
        .select("amount, direction, category")
        .eq("user_id", fundingUserId)
        .eq("ledger_scope", "wallet")
        .in("category", [
          "agent_commission_earned",
          "agent_commission",
          "agent_bonus",
          "partner_commission",
          "referral_bonus",
          "proxy_investment_commission",
          "agent_commission_withdrawal",
          "agent_commission_used_for_rent",
        ]);

      if (!commissionErr && commissionRows) {
        let commissionLedgerBalance = 0;
        for (const row of commissionRows as any[]) {
          const rowAmount = Number(row.amount) || 0;
          const isIn = row.direction === "cash_in" || row.direction === "credit";
          const isOut = row.direction === "cash_out" || row.direction === "debit";

          if (
            isIn &&
            [
              "agent_commission_earned",
              "agent_commission",
              "agent_bonus",
              "partner_commission",
              "referral_bonus",
              "proxy_investment_commission",
            ].includes(row.category)
          ) {
            commissionLedgerBalance += rowAmount;
          } else if (
            isOut &&
            ["agent_commission_withdrawal", "agent_commission_used_for_rent"].includes(row.category)
          ) {
            commissionLedgerBalance -= rowAmount;
          }
        }

        commissionLedgerBalance = Math.max(0, commissionLedgerBalance);
        const totalBuckets = walletWithdrawable + walletFloat + walletAdvance;
        const unallocatedBalance = Math.max(0, walletBalance - totalBuckets);
        const recoverableGap = Math.max(0, commissionLedgerBalance - walletWithdrawable);
        const selfHealAmount = Math.min(unallocatedBalance, recoverableGap);

        if (selfHealAmount > 0) {
          healedWithdrawable = walletWithdrawable + selfHealAmount;
          const { error: walletFixErr } = await admin
            .from("wallets")
            .update({
              withdrawable_balance: healedWithdrawable,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", fundingUserId);

          if (walletFixErr) {
            console.error("[approve-withdrawal] wallet bucket self-heal failed:", walletFixErr);
            healedWithdrawable = walletWithdrawable;
          } else {
            console.log(
              `[approve-withdrawal] self-healed withdrawable bucket for ${fundingUserId} by ${selfHealAmount}`
            );
          }
        }
      }
    }

    // Withdrawable = withdrawable_balance + advance_balance. Float is locked
    // operational money. For proxy payouts, float is also spendable because
    // those funds are partner funds parked in the agent wallet.
    const withdrawable = healedWithdrawable + walletAdvance + totalPendingHold;
    const totalSpendable = isProxyPayout
      ? Math.max(walletBalance, healedWithdrawable + walletAdvance + walletFloat) + totalPendingHold
      : withdrawable;
    const effectiveBalance = totalSpendable;

    if (!wallet || totalSpendable < amount) {
      return new Response(
        JSON.stringify({
          error: `Insufficient withdrawable balance. Available: UGX ${Math.round(totalSpendable).toLocaleString()}, requested: UGX ${amount.toLocaleString()}. (Wallet total UGX ${Math.round(walletBalance).toLocaleString()} — float bucket cannot fund payouts.)`,
          code: "INSUFFICIENT_WITHDRAWABLE",
          available: Math.round(totalSpendable),
          wallet_total: Math.round(walletBalance),
          requested: amount,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    {
      // Drain order: withdrawable_balance first, then advance_balance, then
      // (proxy payouts only) float_balance. Float is otherwise never touched.
      let remaining = amount;
      let nextWithdrawable = healedWithdrawable;
      let nextAdvance = walletAdvance;
      let nextFloat = walletFloat;

      const fromWithdrawable = Math.min(nextWithdrawable, remaining);
      nextWithdrawable -= fromWithdrawable;
      remaining -= fromWithdrawable;

      const fromAdvance = Math.min(nextAdvance, remaining);
      nextAdvance -= fromAdvance;
      remaining -= fromAdvance;

      if (isProxyPayout && remaining > 0) {
        const fromFloat = Math.min(nextFloat, remaining);
        nextFloat -= fromFloat;
        remaining -= fromFloat;
      }

      const { error: walletUpdateErr } = await admin
        .from("wallets")
        .update({
          withdrawable_balance: nextWithdrawable,
          advance_balance: nextAdvance,
          float_balance: nextFloat,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", fundingUserId);

      if (walletUpdateErr) {
        console.error("[approve-withdrawal] Failed to decrement withdrawable bucket:", walletUpdateErr);
        return new Response(JSON.stringify({ error: "Withdrawal recorded but wallet bucket update failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

    // Disbursement email is sent at withdrawal-confirm time (client-side, see WithdrawRequestDialog).
    // Do not re-send here to avoid duplicate partner emails.

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
