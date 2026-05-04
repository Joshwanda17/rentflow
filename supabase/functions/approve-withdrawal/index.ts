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

    const loadWallet = async () => {
      const { data } = await admin
        .from("wallets")
        .select("balance, withdrawable_balance, float_balance, advance_balance")
        .eq("user_id", fundingUserId)
        .maybeSingle();
      return data;
    };

    // 3-BUCKET WALLET MODEL: withdrawals can ONLY draw from withdrawable_balance.
    let wallet = await loadWallet();

    // Reverse any pre-existing 'withdrawal_pending' holds for this request before re-checking.
    const { data: pendingHolds } = await admin
      .from("general_ledger")
      .select("id, amount")
      .eq("source_table", "withdrawal_requests")
      .eq("source_id", withdrawal_id)
      .eq("category", "withdrawal_pending")
      .eq("direction", "cash_out");

    const totalPendingHold = (pendingHolds || []).reduce((sum: number, h: any) => sum + Number(h.amount), 0);

    if (pendingHolds && pendingHolds.length > 0) {
      for (const hold of pendingHolds) {
        await admin.from("general_ledger").delete().eq("id", hold.id);
      }

      try {
        await admin.rpc("reconcile_wallet_from_ledger", { p_user_id: fundingUserId });
      } catch (reconErr) {
        console.error(
          "[approve-withdrawal] reconcile_wallet_from_ledger failed after releasing pending holds:",
          (reconErr as Error).message,
        );
      }

      wallet = await loadWallet();
    }

    const walletBalance = Number(wallet?.balance ?? 0);
    const walletWithdrawable = Number((wallet as any)?.withdrawable_balance ?? 0);
    const walletFloat = Number((wallet as any)?.float_balance ?? 0);
    const walletAdvance = Number((wallet as any)?.advance_balance ?? 0);

    // Normal withdrawals can ONLY draw from withdrawable_balance.
    // Proxy partner delivery is different: the partner owns the credited
    // liability, but the assigned agent physically delivers it, so it may
    // draw only from that partner-linked float — never from generic float.
    const withdrawable = walletWithdrawable;
    const cachedSpendable = isProxyPayout ? walletFloat : withdrawable;

    // STRICT LEDGER-BACKED GATE.
    // Compute the posting-time cap directly from general_ledger, excluding
    // this withdrawal request from holds. Do NOT add the request amount back
    // to the RPC result blindly: when cached float exists but withdrawable is
    // zero, that turns a true UGX 0 into a false approval and the ledger RPC
    // correctly rejects it later as a 500.
    let ledgerAvailable = 0;
    try {
      const sumLedgerRows = (rows: any[] = []) => rows.reduce((acc: number, r: any) => {
        const amt = Number(r.amount) || 0;
        if (r.direction === "cash_in" || r.direction === "credit") return acc + amt;
        if (r.direction === "cash_out" || r.direction === "debit") return acc - amt;
        return acc;
      }, 0);

      if (isProxyPayout && beneficiaryUserId) {
        const { data: linkedRows, error: linkedErr } = await admin
          .from("general_ledger")
          .select("amount, direction")
          .eq("user_id", fundingUserId)
          .eq("ledger_scope", "wallet")
          .eq("linked_party", beneficiaryUserId)
          .or("classification.is.null,classification.eq.production");
        if (linkedErr) throw linkedErr;

        const partnerLinkedNet = sumLedgerRows(linkedRows || []);
        const { data: partnerPendingRows, error: partnerPendingErr } = await admin
          .from("withdrawal_requests")
          .select("amount")
          .eq("user_id", fundingUserId)
          .eq("linked_party", beneficiaryUserId)
          .neq("id", withdrawal_id)
          .in("status", ["pending", "requested", "manager_approved", "processing"]);
        if (partnerPendingErr) throw partnerPendingErr;

        const partnerPendingHolds = (partnerPendingRows || []).reduce(
          (sum: number, p: any) => sum + Number(p.amount || 0),
          0,
        );

        ledgerAvailable = Math.max(
          0,
          Math.min(walletFloat, Math.max(0, partnerLinkedNet)) - partnerPendingHolds,
        );
      } else {
        const { data: ledgerRows, error: ledgerErr } = await admin
          .from("general_ledger")
          .select("amount, direction")
          .eq("user_id", fundingUserId)
          .eq("ledger_scope", "wallet")
          .or("classification.is.null,classification.eq.production");
        if (ledgerErr) throw ledgerErr;

        const ledgerNet = sumLedgerRows(ledgerRows || []);

        const { data: pendingRows, error: pendingErr } = await admin
          .from("withdrawal_requests")
          .select("amount")
          .eq("user_id", fundingUserId)
          .neq("id", withdrawal_id)
          .in("status", ["pending", "requested", "manager_approved", "processing"]);
        if (pendingErr) throw pendingErr;

        const otherPendingHolds = (pendingRows || []).reduce(
          (sum: number, p: any) => sum + Number(p.amount || 0),
          0,
        );

        ledgerAvailable = Math.max(
          0,
          Math.min(cachedSpendable, Math.max(0, ledgerNet)) - otherPendingHolds,
        );
      }
    } catch (e) {
      console.warn(
        "[approve-withdrawal] inline ledger compute failed; falling back to strict RPC",
        (e as Error).message,
      );
      try {
        const { data: rpcVal, error: rpcErr } = await admin.rpc(
          "get_user_available_balance",
          { p_user_id: fundingUserId },
        );
        if (rpcErr) throw rpcErr;
        ledgerAvailable = Math.min(cachedSpendable, Number(rpcVal ?? 0));
      } catch (e2) {
        console.warn(
          "[approve-withdrawal] fallback strict RPC failed; failing closed",
          (e2 as Error).message,
        );
        ledgerAvailable = 0;
      }
    }

    const totalSpendable = Math.min(cachedSpendable, ledgerAvailable);
    const effectiveBalance = totalSpendable;

    if (!wallet || totalSpendable < amount) {
      return new Response(
        JSON.stringify({
          error: isProxyPayout
            ? `Insufficient proxy partner float (ledger-checked). Available: UGX ${Math.round(totalSpendable).toLocaleString()}, requested: UGX ${amount.toLocaleString()}. This payout can only use float linked to the selected partner.`
            : `Insufficient withdrawable balance (ledger-checked). Available: UGX ${Math.round(totalSpendable).toLocaleString()}, requested: UGX ${amount.toLocaleString()}. Cached withdrawable UGX ${Math.round(cachedSpendable).toLocaleString()}, ledger-true UGX ${Math.round(ledgerAvailable).toLocaleString()}. Float and advance buckets cannot fund payouts.`,
          code: "INSUFFICIENT_WITHDRAWABLE",
          available: Math.round(totalSpendable),
          ledger_available: Math.round(ledgerAvailable),
          cached_available: Math.round(cachedSpendable),
          wallet_total: Math.round(walletBalance),
          requested: amount,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get beneficiary profile for audit / notifications
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, phone")
      .eq("id", beneficiaryUserId)
      .single();
    const targetName = profile?.full_name || "Unknown";

    // Create balanced ledger entries via RPC.
    //
    // BUCKET ROUTING: normal external withdrawals drain withdrawable. Verified
    // proxy partner deliveries drain only the partner-linked float bucket.
    const refUpper = reference.trim().toUpperCase();
    const baseDesc = `${payment_method} ref: ${refUpper}`;
    const nowIso = new Date().toISOString();

    const withdrawablePortion = isProxyPayout ? 0 : amount;
    const floatPortion = isProxyPayout ? amount : 0;

    const debitEntries: any[] = [];
    if (withdrawablePortion > 0) {
      debitEntries.push({
        user_id: fundingUserId,
        amount: withdrawablePortion,
        direction: "cash_out",
        category: "wallet_withdrawal",
        ledger_scope: "wallet",
        description: `Wallet withdrawal approved – ${baseDesc}`,
        currency: "UGX",
        source_table: "withdrawal_requests",
        source_id: withdrawal_id,
        transaction_date: nowIso,
        linked_party: user.id,
      });
    }
    if (floatPortion > 0) {
      debitEntries.push({
        user_id: fundingUserId,
        amount: floatPortion,
        direction: "cash_out",
        category: "agent_float_used_for_rent",
        ledger_scope: "wallet",
        description: `Proxy payout from float – ${baseDesc}`,
        currency: "UGX",
        source_table: "withdrawal_requests",
        source_id: withdrawal_id,
        transaction_date: nowIso,
        linked_party: user.id,
      });
    }

    const idempotencyKey = `approve-withdrawal-${withdrawal_id}`;
    const { data: txnGroupId, error: ledgerErr } = await admin.rpc("create_ledger_transaction", {
      entries: [
        ...debitEntries,
        {
          direction: "cash_in",
          amount,
          category: "wallet_withdrawal",
          ledger_scope: "platform",
          description: `Platform records withdrawal payout – ${baseDesc}`,
          currency: "UGX",
          source_table: "withdrawal_requests",
          source_id: withdrawal_id,
          transaction_date: nowIso,
        },
      ],
    });

    if (ledgerErr) {
      console.error("[approve-withdrawal] Ledger RPC error:", ledgerErr);
      const ledgerMessage = ledgerErr.message || "unknown";
      const isInsufficientBalance =
        ledgerMessage.includes("wallets_buckets_nonneg") ||
        ledgerMessage.includes("Insufficient ledger balance");
      return new Response(JSON.stringify({
        error: isInsufficientBalance
          ? isProxyPayout
            ? `Insufficient proxy partner float (ledger-checked). Available: UGX ${Math.round(totalSpendable).toLocaleString()}, requested: UGX ${amount.toLocaleString()}. This payout can only use float linked to the selected partner.`
            : `Insufficient withdrawable balance (ledger-checked). Available: UGX ${Math.round(totalSpendable).toLocaleString()}, requested: UGX ${amount.toLocaleString()}. Cached withdrawable UGX ${Math.round(cachedSpendable).toLocaleString()}, ledger-true UGX ${Math.round(ledgerAvailable).toLocaleString()}. Float and advance buckets cannot fund payouts.`
          : "Failed to record ledger entry: " + ledgerMessage,
        code: isInsufficientBalance ? "INSUFFICIENT_WITHDRAWABLE" : "LEDGER_WRITE_FAILED",
        available: Math.round(totalSpendable),
        ledger_available: Math.round(ledgerAvailable),
        cached_available: Math.round(cachedSpendable),
        wallet_total: Math.round(walletBalance),
        requested: amount,
      }), {
        status: isInsufficientBalance ? 400 : 500,
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

    // ── Payroll Growth Bonus: stop growth on withdrawn money ─────────────
    // Consume FIFO from any active payroll-growth tracker rows so the daily
    // 0.5% bonus only continues to accrue on what's still parked in the wallet.
    try {
      const { data: consumed, error: consumeErr } = await admin.rpc(
        "consume_payroll_growth",
        { _user_id: fundingUserId, _amount: amount },
      );
      if (consumeErr) {
        console.error("[approve-withdrawal] consume_payroll_growth error:", consumeErr.message);
      } else if (Number(consumed ?? 0) > 0) {
        console.log(`[approve-withdrawal] payroll growth consumed: UGX ${consumed} for ${fundingUserId}`);
      }
    } catch (e) {
      console.error("[approve-withdrawal] payroll growth consume threw:", e);
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
        pending_hold_released: totalPendingHold,
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
          url: "/dashboard/agent",
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
        url: "/dashboard/manager",
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
