import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * approve-portfolio-topup
 * 
 * Financial Ops action: Actually applies awaiting_verification top-ups
 * to the portfolio. Creates ledger entries and updates portfolio balance.
 * Only callable by financial_ops / cfo / super_admin roles.
 */
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
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only Financial Ops / CFO / super_admin can approve
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const allowedRoles = ["operations", "cfo", "super_admin"];
    const hasRole = (roles || []).some((r: any) => allowedRoles.includes(r.role));
    if (!hasRole) {
      return new Response(JSON.stringify({ error: "Only Financial Operations can approve portfolio top-ups" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { portfolio_id, action } = body;
    // action: "approve" or "reject"

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!portfolio_id || !UUID_RE.test(portfolio_id)) {
      return new Response(JSON.stringify({ error: "Invalid portfolio_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!action || !["approve", "reject"].includes(action)) {
      return new Response(JSON.stringify({ error: "action must be 'approve' or 'reject'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch portfolio
    const { data: portfolio, error: pErr } = await supabase
      .from("investor_portfolios")
      .select("id, investor_id, agent_id, investment_amount, portfolio_code, account_name, status")
      .eq("id", portfolio_id)
      .single();

    if (pErr || !portfolio) {
      return new Response(JSON.stringify({ error: "Portfolio not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all awaiting_verification top-ups for this portfolio
    const { data: awaitingOps, error: fetchErr } = await supabase
      .from("pending_wallet_operations")
      .select("id, amount, user_id, transaction_group_id")
      .eq("source_id", portfolio_id)
      .eq("source_table", "investor_portfolios")
      .eq("operation_type", "portfolio_topup")
      .eq("status", "awaiting_verification");

    if (fetchErr) {
      return new Response(JSON.stringify({ error: "Failed to fetch top-ups" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!awaitingOps || awaitingOps.length === 0) {
      return new Response(JSON.stringify({ error: "No top-ups awaiting verification for this portfolio" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalAmount = awaitingOps.reduce((s, op) => s + Number(op.amount), 0);
    const currentInvestment = Number(portfolio.investment_amount);
    const accountLabel = portfolio.account_name || portfolio.portfolio_code;
    const now = new Date().toISOString();
    const opIds = awaitingOps.map(op => op.id);
    const partnerId = portfolio.investor_id || portfolio.agent_id;

    // ── REJECT ──
    if (action === "reject") {
      const { error: rejectErr } = await supabase
        .from("pending_wallet_operations")
        .update({ status: "rejected", reviewed_at: now, reviewed_by: user.id })
        .in("id", opIds);

      if (rejectErr) {
        return new Response(JSON.stringify({ error: "Failed to reject top-ups" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action_type: "reject_portfolio_topup",
        table_name: "pending_wallet_operations",
        record_id: portfolio_id,
        metadata: { portfolio_code: portfolio.portfolio_code, count: awaitingOps.length, total_amount: totalAmount, op_ids: opIds },
      });

      // Notify partner
      if (partnerId) {
        await supabase.from("notifications").insert({
          user_id: partnerId,
          title: "❌ Portfolio Top-Up Rejected",
          message: `${awaitingOps.length} top-up(s) totaling UGX ${totalAmount.toLocaleString()} for "${accountLabel}" were not approved. Contact your manager for details.`,
          type: "warning",
          metadata: { portfolio_id, total_amount: totalAmount },
        });
      }

      return new Response(JSON.stringify({
        success: true, action: "rejected", count: awaitingOps.length, total_amount: totalAmount,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── APPROVE: Apply funds ──
    const newInvestment = currentInvestment + totalAmount;

    // 1. Update portfolio investment_amount
    const { error: updateErr } = await supabase
      .from("investor_portfolios")
      .update({ investment_amount: newInvestment })
      .eq("id", portfolio_id);

    if (updateErr) {
      return new Response(JSON.stringify({ error: "Failed to update portfolio" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Mark all ops as approved
    const { error: approveErr } = await supabase
      .from("pending_wallet_operations")
      .update({ status: "approved", reviewed_at: now, reviewed_by: user.id })
      .in("id", opIds);

    if (approveErr) {
      // Rollback portfolio
      await supabase.from("investor_portfolios")
        .update({ investment_amount: currentInvestment })
        .eq("id", portfolio_id);

      return new Response(JSON.stringify({ error: "Failed to approve ops. Portfolio restored." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Record ledger entries
    await supabase.rpc('create_ledger_transaction', {
      entries: [
        {
          user_id: partnerId,
          amount: totalAmount,
          direction: "cash_out",
          category: "partner_funding",
          source_table: "investor_portfolios",
          source_id: portfolio_id,
          description: `${awaitingOps.length} top-up(s) applied to ${accountLabel} — verified by Financial Ops`,
          currency: 'UGX',
          ledger_scope: "platform",
          transaction_date: now,
        },
        {
          user_id: partnerId,
          amount: totalAmount,
          direction: "cash_in",
          category: "partner_funding",
          source_table: "investor_portfolios",
          source_id: portfolio_id,
          description: `${awaitingOps.length} top-up(s) applied to ${accountLabel}`,
          currency: 'UGX',
          ledger_scope: "wallet",
          transaction_date: now,
        },
      ],
    });

    // 4. Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action_type: "approve_portfolio_topup",
      table_name: "investor_portfolios",
      record_id: portfolio_id,
      metadata: {
        partner_id: partnerId,
        count: awaitingOps.length,
        total_applied: totalAmount,
        previous_capital: currentInvestment,
        new_capital: newInvestment,
        op_ids: opIds,
      },
    });

    // 5. Notify partner
    if (partnerId) {
      await supabase.from("notifications").insert({
        user_id: partnerId,
        title: "✅ Portfolio Top-Up Approved",
        message: `${awaitingOps.length} deposit(s) totaling UGX ${totalAmount.toLocaleString()} have been verified and added to "${accountLabel}". New capital: UGX ${newInvestment.toLocaleString()}.`,
        type: "success",
        metadata: { portfolio_id, total_applied: totalAmount, new_capital: newInvestment, approved_by: user.id },
      });
    }

    // 6. Notify executives
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
              title: "✅ Portfolio Top-Up Verified & Applied",
              message: `${awaitingOps.length} top-up(s) totaling UGX ${totalAmount.toLocaleString()} applied to "${accountLabel}" (${portfolio.portfolio_code}). New capital: UGX ${newInvestment.toLocaleString()}.`,
              type: "success",
              metadata: { portfolio_id, total_applied: totalAmount, new_capital: newInvestment, portfolio_code: portfolio.portfolio_code, approved_by: user.id },
            }))
          );
        }
      }
    } catch (notifErr) {
      console.error("[approve-portfolio-topup] Notification error (non-blocking):", notifErr);
    }

    console.log(`[approve-portfolio-topup] FinOps ${user.id} approved ${awaitingOps.length} top-ups (${totalAmount}) for ${portfolio_id}. New total: ${newInvestment}`);

    return new Response(JSON.stringify({
      success: true,
      action: "approved",
      count: awaitingOps.length,
      total_applied: totalAmount,
      new_investment_total: newInvestment,
      portfolio_code: portfolio.portfolio_code,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[approve-portfolio-topup] Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
