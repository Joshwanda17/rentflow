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

    // Verify caller is COO/manager
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const allowedRoles = ["coo", "manager", "cfo", "super_admin"];
    const hasRole = (roles || []).some((r: any) => allowedRoles.includes(r.role));
    if (!hasRole) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { portfolio_id } = body;

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!portfolio_id || !UUID_RE.test(portfolio_id)) {
      return new Response(JSON.stringify({ error: "Invalid portfolio_id" }), {
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

    // Fetch all pending top-ups for this portfolio
    const { data: pendingOps, error: fetchErr } = await supabase
      .from("pending_wallet_operations")
      .select("id, amount, user_id, transaction_group_id")
      .eq("source_id", portfolio_id)
      .eq("source_table", "investor_portfolios")
      .eq("operation_type", "portfolio_topup")
      .eq("status", "pending");

    if (fetchErr) {
      return new Response(JSON.stringify({ error: "Failed to fetch pending top-ups" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!pendingOps || pendingOps.length === 0) {
      return new Response(JSON.stringify({ error: "No pending top-ups to apply" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalPending = pendingOps.reduce((s, op) => s + Number(op.amount), 0);
    const currentInvestment = Number(portfolio.investment_amount);
    const newInvestment = currentInvestment + totalPending;
    const accountLabel = portfolio.account_name || portfolio.portfolio_code;
    const now = new Date().toISOString();
    const txGroupId = crypto.randomUUID();
    const partnerId = portfolio.investor_id || portfolio.agent_id;

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

    // 2. Mark all pending ops as approved
    const pendingIds = pendingOps.map(op => op.id);
    const { error: approveErr } = await supabase
      .from("pending_wallet_operations")
      .update({
        status: "approved",
        reviewed_at: now,
        reviewed_by: user.id,
      })
      .in("id", pendingIds);

    if (approveErr) {
      // Rollback portfolio
      await supabase
        .from("investor_portfolios")
        .update({ investment_amount: currentInvestment })
        .eq("id", portfolio_id);

      return new Response(JSON.stringify({ error: "Failed to approve pending ops. Portfolio restored." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Record activation ledger entries via RPC
    await supabase.rpc('create_ledger_transaction', {
      entries: [
        {
          user_id: partnerId,
          amount: totalPending,
          direction: "cash_out",
          category: "partner_funding",
          source_table: "investor_portfolios",
          source_id: portfolio_id,
          description: `${pendingOps.length} pending top-up(s) applied to ${accountLabel} — platform disbursal`,
          currency: 'UGX',
          ledger_scope: "platform",
          transaction_date: now,
        },
        {
          user_id: partnerId,
          amount: totalPending,
          direction: "cash_in",
          category: "partner_funding",
          source_table: "investor_portfolios",
          source_id: portfolio_id,
          description: `${pendingOps.length} pending top-up(s) applied to ${accountLabel}`,
          currency: 'UGX',
          ledger_scope: "wallet",
          transaction_date: now,
        },
      ],
    });

    // 4. Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action_type: "apply_pending_topups",
      table_name: "investor_portfolios",
      record_id: portfolio_id,
      metadata: {
        partner_id: partnerId,
        count: pendingOps.length,
        total_applied: totalPending,
        previous_capital: currentInvestment,
        new_capital: newInvestment,
        pending_op_ids: pendingIds,
      },
    });

    // 5. Notify partner
    await supabase.from("notifications").insert({
      user_id: partnerId,
      title: "✅ Pending Top-Ups Applied",
      message: `${pendingOps.length} pending deposit(s) totaling UGX ${totalPending.toLocaleString()} have been added to "${accountLabel}". New capital: UGX ${newInvestment.toLocaleString()}.`,
      type: "success",
      metadata: { portfolio_id, total_applied: totalPending, new_capital: newInvestment, applied_by: user.id },
    });

    // 6. Notify CFO + COO executives
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
              title: "✅ Portfolio Top-Ups Applied",
              message: `${pendingOps.length} pending top-up(s) totaling UGX ${totalPending.toLocaleString()} applied to "${accountLabel}" (${portfolio.portfolio_code}). New capital: UGX ${newInvestment.toLocaleString()}.`,
              type: "success",
              metadata: { portfolio_id, total_applied: totalPending, new_capital: newInvestment, portfolio_code: portfolio.portfolio_code, applied_by: user.id },
            }))
          );
        }
      }
    } catch (notifErr) {
      console.error("[apply-pending-topups] Executive notification error (non-blocking):", notifErr);
    }

    console.log(`[apply-pending-topups] Manager ${user.id} applied ${pendingOps.length} pending top-ups (${totalPending}) to ${portfolio_id}. New total: ${newInvestment}`);


    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ title: "✅ Pending Top-Ups Applied", body: "Activity: pending top-ups applied", url: "/manager" }),
    }).catch(() => {});


    return new Response(JSON.stringify({
      success: true,
      count: pendingOps.length,
      total_applied: totalPending,
      new_investment_total: newInvestment,
      portfolio_code: portfolio.portfolio_code,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[apply-pending-topups] Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
