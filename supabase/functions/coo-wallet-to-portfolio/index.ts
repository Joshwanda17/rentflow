import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildPartnershipTopupRequest, dispatchTransactionalEmail } from "../_shared/partnership-emails.ts";
import { checkTreasuryGuard } from "../_shared/treasuryGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_METHODS = ["wallet", "proxy_agent"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonRes(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Treasury guard: block when money movement paused
    const guardBlock = await checkTreasuryGuard(supabase, "any");
    if (guardBlock) return guardBlock;

    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return jsonRes({ error: "Unauthorized" }, 401);

    // Verify caller role (COO, manager, super_admin)
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const allowedRoles = ["coo", "manager", "super_admin"];
    if (!(roles || []).some((r: any) => allowedRoles.includes(r.role))) {
      return jsonRes({ error: "Insufficient permissions" }, 403);
    }

    const body = await req.json();
    const { portfolio_id, amount, reason, payment_method, source_wallet_user_id } = body;

    // Validate inputs
    if (!portfolio_id || !UUID_RE.test(portfolio_id)) {
      return jsonRes({ error: "Invalid portfolio_id" }, 400);
    }

    const topupAmount = Number(amount);
    if (!topupAmount || topupAmount < 1000) {
      return jsonRes({ error: "Minimum transfer is UGX 1,000" }, 400);
    }
    if (topupAmount > 200_000_000_000) {
      return jsonRes({ error: "Amount exceeds maximum" }, 400);
    }

    const safeReason = typeof reason === "string" ? reason.trim().slice(0, 500) : "";
    if (safeReason.length < 10) {
      return jsonRes({ error: "Reason must be at least 10 characters" }, 400);
    }

    // Validate payment method (default to wallet for backward compat)
    const method = payment_method && VALID_METHODS.includes(payment_method) ? payment_method : "wallet";

    // Fetch portfolio
    const { data: portfolio, error: pErr } = await supabase
      .from("investor_portfolios")
      .select("id, investor_id, agent_id, investment_amount, status, portfolio_code, account_name")
      .eq("id", portfolio_id)
      .single();

    if (pErr || !portfolio) return jsonRes({ error: "Portfolio not found" }, 404);

    if (portfolio.status === "cancelled") {
      return jsonRes({ error: "Cannot fund a cancelled portfolio" }, 400);
    }

    const partnerId = portfolio.investor_id || portfolio.agent_id;
    const accountLabel = portfolio.account_name || portfolio.portfolio_code;

    // ── Resolve source wallet ──
    // For "wallet" method, use explicit source_wallet_user_id if provided (COO may be viewing
    // a partner whose portfolios have a different investor_id)
    let walletOwnerId = (method === "wallet" && source_wallet_user_id && UUID_RE.test(source_wallet_user_id))
      ? source_wallet_user_id
      : partnerId;
    let walletOwnerLabel = "Partner Wallet";
    let agentName: string | null = null;

    if (method === "proxy_agent") {
      let agentId = source_wallet_user_id;
      if (!agentId) {
        const { data: proxyAssignment } = await supabase
          .from("proxy_agent_assignments")
          .select("agent_id")
          .eq("beneficiary_id", partnerId)
          .eq("is_active", true)
          .eq("approval_status", "approved")
          .limit(1)
          .maybeSingle();

        if (!proxyAssignment?.agent_id) {
          return jsonRes({ error: "No active proxy agent assigned to this partner" }, 400);
        }
        agentId = proxyAssignment.agent_id;
      }
      walletOwnerId = agentId;

      const { data: agentProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", agentId)
        .single();
      agentName = agentProfile?.full_name || "Agent";
      walletOwnerLabel = `Proxy Agent (${agentName})`;
    }

    // ── Check wallet balance ──
    const { data: wallet, error: wErr } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", walletOwnerId)
      .single();

    if (wErr || !wallet) return jsonRes({ error: `${walletOwnerLabel} wallet not found` }, 404);

    const currentBalance = Number(wallet.balance);
    if (currentBalance < topupAmount) {
      return jsonRes({ error: `Insufficient ${walletOwnerLabel.toLowerCase()} balance. Available: UGX ${currentBalance.toLocaleString()}` }, 400);
    }

    const txGroupId = crypto.randomUUID();

    // ── 1. Create wallet transaction (visible in tx history) ──
    const { error: txErr } = await supabase.from("wallet_transactions").insert({
      sender_id: walletOwnerId,
      recipient_id: walletOwnerId,
      amount: topupAmount,
      description: `COO Portfolio transfer: ${accountLabel} (${portfolio.portfolio_code})`,
    });

    if (txErr) {
      console.error("[coo-wallet-to-portfolio] wallet_transactions insert error:", txErr);
      return jsonRes({ error: "Failed to record wallet transaction" }, 500);
    }

    // ── 2. Deduct from wallet immediately via ledger (FATAL on failure) ──
    const { error: ledgerErr } = await supabase.rpc("create_ledger_transaction", {
      entries: [
        {
          user_id: walletOwnerId,
          amount: topupAmount,
          direction: "cash_out",
          category: "wallet_deduction",
          description: `Wallet deduction for ${accountLabel} top-up`,
          source_table: "investor_portfolios",
          source_id: portfolio_id,
          linked_party: "platform",
        },
        {
          user_id: partnerId,
          amount: topupAmount,
          direction: "cash_in",
          category: "pending_portfolio_topup",
          description: `Pending capital for ${accountLabel} — applied at maturity`,
          source_table: "investor_portfolios",
          source_id: portfolio_id,
          linked_party: walletOwnerId,
        },
      ],
    });

    if (ledgerErr) {
      console.error("[coo-wallet-to-portfolio] LEDGER FAILURE — aborting:", ledgerErr);
      return jsonRes({ error: `Wallet deduction failed: ${ledgerErr.message}. Top-up cancelled.` }, 500);
    }

    // ── 3. Record pre-approved pending top-up (applied at maturity) ──
    const { error: pendingErr } = await supabase.from("pending_wallet_operations").insert({
      user_id: partnerId,
      amount: topupAmount,
      direction: "cash_in",
      category: "pending_portfolio_topup",
      source_table: "investor_portfolios",
      source_id: portfolio_id,
      transaction_group_id: txGroupId,
      description: `${walletOwnerLabel}: ${accountLabel} — pre-approved`,
      linked_party: "platform",
      status: "approved",
      operation_type: "portfolio_topup",
      metadata: {
        initiated_by: user.id,
        initiated_by_role: "coo",
        payment_method: method,
        source_wallet_user_id: walletOwnerId,
        source_wallet_owner: walletOwnerLabel,
        agent_name: agentName,
        source: method,
        portfolio_code: portfolio.portfolio_code,
        reason: safeReason,
        pre_approved: true,
        wallet_balance_before: currentBalance,
      },
    });

    if (pendingErr) {
      console.error("[coo-wallet-to-portfolio] pending insert error:", pendingErr);
      return jsonRes({ error: "Failed to record pending top-up." }, 500);
    }

    // ── 4. Audit trail ──
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action_type: "coo_wallet_to_portfolio_instant",
      table_name: "investor_portfolios",
      record_id: portfolio_id,
      metadata: {
        partner_id: partnerId,
        wallet_owner_id: walletOwnerId,
        wallet_owner_label: walletOwnerLabel,
        amount: topupAmount,
        current_capital: Number(portfolio.investment_amount),
        payment_method: method,
        wallet_balance_before: currentBalance,
        wallet_balance_after: currentBalance - topupAmount,
        reason: safeReason,
      },
    });

    // ── 5. Notify partner ──
    await supabase.from("notifications").insert({
      user_id: partnerId,
      title: "💰 Portfolio Top-Up Processed",
      message: `UGX ${topupAmount.toLocaleString()} deducted from ${walletOwnerLabel.toLowerCase()} for "${accountLabel}". Capital will be applied at maturity.`,
      type: "info",
      metadata: { portfolio_id, amount: topupAmount, status: "approved", source: walletOwnerLabel },
    });

    // ── 6. Notify CFO + COO executives ──
    try {
      const { data: execs } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["cfo", "coo"])
        .eq("enabled", true);
      if (execs && execs.length > 0) {
        const uniqueIds = [...new Set(execs.map((e: any) => e.user_id).filter((id: string) => id !== user.id))];
        if (uniqueIds.length > 0) {
          await supabase.from("notifications").insert(
            uniqueIds.map((uid: string) => ({
              user_id: uid,
              title: "📊 COO Portfolio Transfer (Pre-Approved)",
              message: `UGX ${topupAmount.toLocaleString()} from ${walletOwnerLabel} → "${accountLabel}" (${portfolio.portfolio_code}). Instant deduction — applied at maturity.`,
              type: "info",
              metadata: { portfolio_id, amount: topupAmount, portfolio_code: portfolio.portfolio_code, initiated_by: user.id, source: walletOwnerLabel },
            }))
          );
        }
      }
    } catch (notifErr) {
      console.error("[coo-wallet-to-portfolio] Executive notification error (non-blocking):", notifErr);
    }

    console.log(`[coo-wallet-to-portfolio] COO ${user.id} instant ${method} top-up ${topupAmount} for portfolio ${portfolio_id} (wallet owner: ${walletOwnerId})`);

    // Partnership Top-Up email — target = partner (not the COO actor)
    try {
      const { data: partnerEmailRow } = await supabase
        .from("profiles").select("email, full_name").eq("id", partnerId).maybeSingle();
      if (partnerEmailRow?.email) {
        const previousValue = Number(portfolio.investment_amount) || 0;
        dispatchTransactionalEmail(
          supabaseUrl,
          serviceKey,
          buildPartnershipTopupRequest({
            recipientEmail: partnerEmailRow.email,
            partnerName: partnerEmailRow.full_name,
            partnerId,
            txGroupId,
            topupAmount,
            previousPortfolioValue: previousValue,
            newTotalPartnershipValue: previousValue + topupAmount,
          }),
          "coo-wallet-to-portfolio",
        );
      }
    } catch (emailErr) {
      console.warn("[coo-wallet-to-portfolio] Email lookup failed (non-blocking):", emailErr);
    }

    // Fire-and-forget notifications
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ title: "📊 COO Portfolio Transfer", body: `UGX ${topupAmount.toLocaleString()} ${walletOwnerLabel} → ${accountLabel} (${portfolio.portfolio_code})`, url: "/dashboard/manager" }),
    }).catch(() => {});

    fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({
        userIds: [partnerId],
        payload: { title: "💰 Portfolio Credited", body: `UGX ${topupAmount.toLocaleString()} top-up processed for ${accountLabel}`, url: "/dashboard/funder", type: "success" },
      }),
    }).catch(() => {});

    return jsonRes({
      success: true,
      amount: topupAmount,
      status: "approved",
      payment_method: method,
      source_wallet: walletOwnerLabel,
      current_capital: Number(portfolio.investment_amount),
      wallet_balance: currentBalance,
      portfolio_code: portfolio.portfolio_code,
    }, 200);

  } catch (error) {
    console.error("[coo-wallet-to-portfolio] Error:", error);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
