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

    // Verify caller role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const allowedRoles = ["coo", "manager", "cfo", "super_admin"];
    if (!(roles || []).some((r: any) => allowedRoles.includes(r.role))) {
      return jsonRes({ error: "Insufficient permissions" }, 403);
    }

    const body = await req.json();
    const { portfolio_id, amount, notes, payment_method, source_wallet_user_id } = body;

    // Validate portfolio_id
    if (!portfolio_id || !UUID_RE.test(portfolio_id)) {
      return jsonRes({ error: "Invalid portfolio_id" }, 400);
    }

    // Validate amount
    const topupAmount = Number(amount);
    if (!topupAmount || topupAmount < 1000) {
      return jsonRes({ error: "Minimum top-up is UGX 1,000" }, 400);
    }
    if (topupAmount > 200_000_000_000) {
      return jsonRes({ error: "Amount exceeds maximum" }, 400);
    }

    // Validate payment method
    if (!payment_method || !VALID_METHODS.includes(payment_method)) {
      return jsonRes({ error: "Invalid payment method. Use: wallet or proxy_agent" }, 400);
    }

    const safeNotes = typeof notes === "string" ? notes.slice(0, 500) : "";

    // Fetch portfolio
    const { data: portfolio, error: pErr } = await supabase
      .from("investor_portfolios")
      .select("id, investor_id, agent_id, investment_amount, status, portfolio_code, account_name")
      .eq("id", portfolio_id)
      .single();

    if (pErr || !portfolio) return jsonRes({ error: "Portfolio not found" }, 404);

    if (portfolio.status === "cancelled") {
      return jsonRes({ error: "Cannot top up a cancelled portfolio" }, 400);
    }

    const partnerId = portfolio.investor_id || portfolio.agent_id;
    const txGroupId = crypto.randomUUID();
    const accountLabel = portfolio.account_name || portfolio.portfolio_code;

    // ── Resolve source wallet ──
    let walletOwnerId = partnerId;
    let walletOwnerLabel = "Partner Wallet";
    let agentName: string | null = null;

    if (payment_method === "proxy_agent") {
      // Validate source_wallet_user_id or look up proxy assignment
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

      // Get agent name
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

    const walletBalance = Number(wallet.balance);
    if (walletBalance < topupAmount) {
      return jsonRes({ error: `Insufficient ${walletOwnerLabel.toLowerCase()} balance. Available: UGX ${walletBalance.toLocaleString()}` }, 400);
    }

    // ── 1. Create wallet transaction (visible in partner/agent tx history) ──
    const { error: txErr } = await supabase.from("wallet_transactions").insert({
      sender_id: walletOwnerId,
      recipient_id: walletOwnerId, // self — internal portfolio transfer
      amount: topupAmount,
      description: `Portfolio top-up: ${accountLabel} (${portfolio.portfolio_code})`,
    });

    if (txErr) {
      console.error("[manager-portfolio-topup] wallet_transactions insert error:", txErr);
      return jsonRes({ error: "Failed to record wallet transaction" }, 500);
    }

    // ── 2. Deduct from wallet immediately (FATAL on failure — no silent leaks) ──
    // CRITICAL: The credit (cash_in) MUST be platform-scope. If it stays at the default
    // wallet scope and the partner == wallet owner, the two entries net-zero and the
    // wallet never reduces. Money has left the user's wallet → it now sits with the platform.
    const { error: deductErr } = await supabase.rpc("create_ledger_transaction", {
      entries: [
        {
          user_id: walletOwnerId,
          amount: topupAmount,
          direction: "cash_out",
          category: "wallet_deduction",
          ledger_scope: "wallet",
          description: `Wallet deduction for ${accountLabel} top-up`,
          source_table: "investor_portfolios",
          source_id: portfolio_id,
          linked_party: "platform",
          currency: "UGX",
          transaction_date: new Date().toISOString(),
        },
        {
          user_id: partnerId,
          amount: topupAmount,
          direction: "cash_in",
          category: "pending_portfolio_topup",
          ledger_scope: "platform",
          description: `Pending capital for ${accountLabel} — applied at maturity`,
          source_table: "investor_portfolios",
          source_id: portfolio_id,
          linked_party: walletOwnerId,
          currency: "UGX",
          transaction_date: new Date().toISOString(),
        },
      ],
    });

    if (deductErr) {
      console.error("[manager-portfolio-topup] LEDGER FAILURE — aborting:", deductErr);
      return jsonRes({ error: `Wallet deduction failed: ${deductErr.message}. Top-up cancelled.` }, 500);
    }

    // ── 2b. Verify wallet actually decreased (guard against silent net-zero bugs) ──
    const { data: postWallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", walletOwnerId)
      .single();
    const postBalance = Number(postWallet?.balance ?? walletBalance);
    if (postBalance >= walletBalance) {
      console.error(`[manager-portfolio-topup] WALLET DID NOT DECREASE — before=${walletBalance} after=${postBalance}`);
      return jsonRes({ error: "Wallet did not decrease. Top-up aborted." }, 500);
    }

    // ── 3. Record pre-approved pending operation (for maturity merge) ──
    const { error: pendingErr } = await supabase.from("pending_wallet_operations").insert({
      user_id: partnerId,
      amount: topupAmount,
      direction: "cash_in",
      category: "pending_portfolio_topup",
      source_table: "investor_portfolios",
      source_id: portfolio_id,
      transaction_group_id: txGroupId,
      description: `${walletOwnerLabel} top-up for ${accountLabel} — pre-approved`,
      linked_party: "platform",
      status: "approved",
      operation_type: "portfolio_topup",
      account: payment_method,
      metadata: {
        payment_method,
        source_wallet_user_id: walletOwnerId,
        source_wallet_owner: walletOwnerLabel,
        agent_name: agentName,
        initiated_by: user.id,
        portfolio_code: portfolio.portfolio_code,
        pre_approved: true,
        wallet_balance_before: walletBalance,
      },
    });

    if (pendingErr) {
      console.error("[manager-portfolio-topup] pending insert error:", pendingErr);
      return jsonRes({ error: "Failed to record pending top-up" }, 500);
    }

    // ── 4. Audit trail ──
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action_type: "manager_portfolio_topup_instant",
      table_name: "investor_portfolios",
      record_id: portfolio_id,
      metadata: {
        partner_id: partnerId,
        wallet_owner_id: walletOwnerId,
        wallet_owner_label: walletOwnerLabel,
        amount: topupAmount,
        current_capital: Number(portfolio.investment_amount),
        payment_method,
        notes: safeNotes,
        status: "approved",
        wallet_balance_before: walletBalance,
        wallet_balance_after: walletBalance - topupAmount,
      },
    });

    // ── 5. Notify partner ──
    await supabase.from("notifications").insert({
      user_id: partnerId,
      title: "💰 Portfolio Top-Up Processed",
      message: `UGX ${topupAmount.toLocaleString()} deducted from ${walletOwnerLabel.toLowerCase()} for "${accountLabel}". Capital will be applied at maturity.`,
      type: "info",
      metadata: { portfolio_id, amount: topupAmount, payment_method, status: "approved", source: walletOwnerLabel },
    });

    // ── 6. Notify executives (non-blocking) ──
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
              title: "📊 Portfolio Top-Up (Pre-Approved)",
              message: `UGX ${topupAmount.toLocaleString()} from ${walletOwnerLabel} → "${accountLabel}" (${portfolio.portfolio_code}). Instant deduction — applied at maturity.`,
              type: "info",
              metadata: { portfolio_id, amount: topupAmount, payment_method, portfolio_code: portfolio.portfolio_code, initiated_by: user.id },
            }))
          );
        }
      }
    } catch (notifErr) {
      console.error("[manager-portfolio-topup] Executive notification error (non-blocking):", notifErr);
    }

    console.log(`[manager-portfolio-topup] ${user.id} instant ${payment_method} top-up ${topupAmount} for portfolio ${portfolio_id} (wallet owner: ${walletOwnerId})`);

    // Partnership Top-Up email — target = partner (not the manager actor)
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
          "manager-portfolio-topup",
        );
      }
    } catch (emailErr) {
      console.warn("[manager-portfolio-topup] Email lookup failed (non-blocking):", emailErr);
    }

    // Fire-and-forget notifications
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ title: "📊 Portfolio Top-Up", body: `UGX ${topupAmount.toLocaleString()} ${walletOwnerLabel} → ${accountLabel} (${portfolio.portfolio_code})`, url: "/dashboard/manager" }),
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
      payment_method,
      source_wallet: walletOwnerLabel,
      current_capital: Number(portfolio.investment_amount),
      portfolio_code: portfolio.portfolio_code,
    }, 200);

  } catch (error) {
    console.error("[manager-portfolio-topup] Error:", error);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
