import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_METHODS = ["cash", "mobile_money", "bank", "wallet"] as const;
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
    const { portfolio_id, amount, notes, payment_method, transaction_reference } = body;

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
      return jsonRes({ error: "Invalid payment method. Use: cash, mobile_money, bank, or wallet" }, 400);
    }

    // Validate transaction reference for non-cash/non-wallet methods
    const safeRef = typeof transaction_reference === "string" ? transaction_reference.trim().slice(0, 50) : "";
    if (payment_method === "mobile_money" && safeRef.length < 8) {
      return jsonRes({ error: "Mobile Money TID must be at least 8 characters" }, 400);
    }
    if (payment_method === "bank" && safeRef.length < 6) {
      return jsonRes({ error: "Bank reference must be at least 6 characters" }, 400);
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
    const now = new Date().toISOString();

    const methodLabel = payment_method === "wallet" ? "Wallet" : payment_method === "mobile_money" ? "Mobile Money" : payment_method === "bank" ? "Bank Transfer" : "Cash";
    const refLabel = safeRef ? ` (${payment_method === "mobile_money" ? "TID" : "Ref"}: ${safeRef})` : "";

    // ── WALLET PAYMENT: Check balance & deduct via ledger ──
    if (payment_method === "wallet") {
      // 1. Check partner wallet balance
      const { data: wallet, error: wErr } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", partnerId)
        .single();

      if (wErr || !wallet) return jsonRes({ error: "Partner wallet not found" }, 404);

      if (Number(wallet.balance) < topupAmount) {
        return jsonRes({ error: `Insufficient wallet balance. Available: UGX ${Number(wallet.balance).toLocaleString()}` }, 400);
      }

      // 2. Record pending operation
      const { error: pendingErr } = await supabase.from("pending_wallet_operations").insert({
        user_id: partnerId,
        amount: topupAmount,
        direction: "cash_in",
        category: "pending_portfolio_topup",
        source_table: "investor_portfolios",
        source_id: portfolio_id,
        transaction_group_id: txGroupId,
        description: `Wallet top-up for ${accountLabel} — initiated by executive`,
        linked_party: "platform",
        status: "pending",
        operation_type: "portfolio_topup",
        reference_id: null,
        account: "wallet",
        metadata: {
          payment_method: "wallet",
          initiated_by: user.id,
          portfolio_code: portfolio.portfolio_code,
          source: "executive_wallet_deduction",
        },
      });

      if (pendingErr) {
        console.error("[manager-portfolio-topup] pending insert error:", pendingErr);
        return jsonRes({ error: "Failed to record pending top-up" }, 500);
      }

      // 3. Ledger entries via RPC — wallet debit + platform credit
      const { error: ledgerErr } = await supabase.rpc('create_ledger_transaction', {
      entries: [
          {
            user_id: partnerId,
            amount: topupAmount,
            direction: "cash_out",
            category: "partner_funding",
            source_table: "investor_portfolios",
            source_id: portfolio_id,
            description: `Wallet deduction for portfolio top-up: ${accountLabel}`,
            currency: 'UGX',
            ledger_scope: "wallet",
            transaction_date: now,
          },
          {
            user_id: partnerId,
            amount: topupAmount,
            direction: "cash_in",
            category: "partner_funding",
            source_table: "investor_portfolios",
            source_id: portfolio_id,
            description: `Pending capital via Wallet for ${accountLabel}`,
            currency: 'UGX',
            ledger_scope: "platform",
            transaction_date: now,
          },
        ],
      });

      if (ledgerErr) {
        console.error("[manager-portfolio-topup] wallet ledger error:", ledgerErr);
        return jsonRes({ error: "Failed to record ledger entry" }, 500);
      }

      // 4. Post-ledger verification: ensure wallet didn't go negative
      const { data: postWallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", partnerId)
        .single();

      if (postWallet && Number(postWallet.balance) < 0) {
        // Race condition: rollback via RPC
        await supabase.rpc('create_ledger_transaction', {
          entries: [
            {
              user_id: partnerId,
              amount: topupAmount,
              direction: "cash_in",
              category: "system_balance_correction",
              source_table: "investor_portfolios",
              source_id: portfolio_id,
              description: `Reversal: insufficient balance for ${accountLabel} wallet top-up`,
              currency: 'UGX',
              ledger_scope: "wallet",
              transaction_date: new Date().toISOString(),
            },
            {
              user_id: partnerId,
              amount: topupAmount,
              direction: "cash_out",
              category: "system_balance_correction",
              source_table: "investor_portfolios",
              source_id: portfolio_id,
              description: `Reversal: platform return for failed ${accountLabel} wallet top-up`,
              currency: 'UGX',
              ledger_scope: "platform",
              transaction_date: new Date().toISOString(),
            },
          ],
        });

        await supabase.from("pending_wallet_operations")
          .update({ status: "cancelled" })
          .eq("transaction_group_id", txGroupId);

        return jsonRes({ error: "Insufficient wallet balance after deduction" }, 400);
      }

      // 5. Record wallet transaction for partner's activity feed
      await supabase.from("wallet_transactions").insert({
        sender_id: partnerId,
        recipient_id: partnerId,
        amount: topupAmount,
        description: `Portfolio top-up to ${accountLabel} (from wallet)`,
      });

    } else {
      // ── NON-WALLET PAYMENT (cash, mobile_money, bank) ──

      // 1. Record pending operation
      const { error: pendingErr } = await supabase.from("pending_wallet_operations").insert({
        user_id: partnerId,
        amount: topupAmount,
        direction: "cash_in",
        category: "pending_portfolio_topup",
        source_table: "investor_portfolios",
        source_id: portfolio_id,
        transaction_group_id: txGroupId,
        description: `Pending ${methodLabel} top-up for ${accountLabel}${refLabel}`,
        linked_party: "platform",
        status: "pending",
        operation_type: "portfolio_topup",
        reference_id: safeRef || null,
        account: payment_method,
        metadata: {
          payment_method,
          transaction_reference: safeRef || null,
          initiated_by: user.id,
          portfolio_code: portfolio.portfolio_code,
        },
      });

      if (pendingErr) {
        console.error("[manager-portfolio-topup] pending insert error:", pendingErr);
        return jsonRes({ error: "Failed to record pending top-up" }, 500);
      }

      // 2. NO ledger entry for external payments (cash/MoMo/bank).
      //    The pending_wallet_operations record tracks the intent.
      //    Actual ledger entries are created when apply-pending-topups
      //    runs at maturity — matching the deposit approval pattern.
      //    Writing a wallet cash_out here would phantom-debit the partner.
    }

    // ── SHARED: Audit trail ──
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action_type: "manager_portfolio_topup_pending",
      table_name: "investor_portfolios",
      record_id: portfolio_id,
      metadata: {
        partner_id: partnerId,
        amount: topupAmount,
        current_capital: Number(portfolio.investment_amount),
        payment_method,
        transaction_reference: safeRef || null,
        notes: safeNotes,
        status: "pending_verification",
        wallet_deduction: payment_method === "wallet",
      },
    });

    // ── SHARED: Notify partner ──
    const partnerMsg = payment_method === "wallet"
      ? `UGX ${topupAmount.toLocaleString()} deducted from your wallet for portfolio "${accountLabel}". Awaiting verification.`
      : `UGX ${topupAmount.toLocaleString()} ${methodLabel} top-up submitted for "${accountLabel}".${refLabel} Awaiting verification.`;

    await supabase.from("notifications").insert({
      user_id: partnerId,
      title: payment_method === "wallet" ? "💳 Wallet → Portfolio Top-Up" : "⏳ Portfolio Top-Up Pending",
      message: partnerMsg,
      type: "info",
      metadata: { portfolio_id, amount: topupAmount, payment_method, status: "pending", initiated_by: user.id },
    });

    // ── SHARED: Notify CFO + COO executives ──
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
              title: "📊 Portfolio Top-Up Submitted",
              message: `UGX ${topupAmount.toLocaleString()} ${methodLabel} top-up for "${accountLabel}" (${portfolio.portfolio_code})${refLabel} — pending verification.`,
              type: "info",
              metadata: { portfolio_id, amount: topupAmount, payment_method, portfolio_code: portfolio.portfolio_code, initiated_by: user.id },
            }))
          );
        }
      }
    } catch (notifErr) {
      console.error("[manager-portfolio-topup] Executive notification error (non-blocking):", notifErr);
    }

    console.log(`[manager-portfolio-topup] Manager ${user.id} submitted ${methodLabel} top-up for ${portfolio_id} (partner: ${partnerId}) amount ${topupAmount}${refLabel}`);

    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ title: "📊 Manager Portfolio Top-Up", body: `UGX ${topupAmount.toLocaleString()} ${methodLabel} top-up for ${accountLabel} (${portfolio.portfolio_code})`, url: "/manager" }),
    }).catch(() => {});

    // Push notification to partner (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({
        userIds: [partnerId],
        payload: { title: "💰 Portfolio Credited", body: `UGX ${topupAmount.toLocaleString()} ${methodLabel} top-up submitted for ${accountLabel}`, url: "/dashboard", type: "success" },
      }),
    }).catch(() => {});

    return jsonRes({
      success: true,
      amount: topupAmount,
      status: "pending",
      payment_method,
      current_capital: Number(portfolio.investment_amount),
      portfolio_code: portfolio.portfolio_code,
    }, 200);

  } catch (error) {
    console.error("[manager-portfolio-topup] Error:", error);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
