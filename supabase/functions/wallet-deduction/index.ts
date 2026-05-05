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

    // Validate caller
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    // Check caller has financial-ops permission via user_roles
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Treasury guard: block debits when paused
    const guardBlock = await checkTreasuryGuard(adminClient, "debit");
    if (guardBlock) return guardBlock;
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const allowedRoles = ["super_admin", "manager", "cfo", "coo"];
    const hasAccess = (roles || []).some((r: any) => allowedRoles.includes(r.role));
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "Forbidden: insufficient role" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse & validate body
    const body = await req.json();
    const { target_user_id, amount, category, reason } = body;

    if (!target_user_id || typeof target_user_id !== "string") {
      return new Response(JSON.stringify({ error: "target_user_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return new Response(JSON.stringify({ error: "amount must be a positive number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!reason || typeof reason !== "string" || reason.trim().length < 10) {
      return new Response(JSON.stringify({ error: "reason must be at least 10 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validCategories = [
      "fee_correction",
      "fraud_reversal",
      "penalty",
      "overpayment_reversal",
      "general_adjustment",
      "cash_payout_retraction",
      "other",
    ];
    const safeCategory = validCategories.includes(category) ? category : "general_adjustment";

    // Check user wallet balance
    const { data: wallet } = await adminClient
      .from("wallets")
      .select("balance, withdrawable_balance, float_balance, advance_balance")
      .eq("user_id", target_user_id)
      .single();

    if (!wallet) {
      return new Response(JSON.stringify({ error: "Target user has no wallet" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cacheWithdrawable = Math.max(0, Number(wallet.withdrawable_balance ?? 0));
    const cacheFloat = Math.max(0, Number(wallet.float_balance ?? 0));

    // CFO/FinOps deductions pull directly from the live wallet bucket. Do not
    // block because strict historical ledger net is lower or negative; older
    // ledger drift is handled by reconciliation, while this tool removes the
    // amount currently visible in the user's wallet.
    const isRetraction = safeCategory === 'cash_payout_retraction';
    const trueAvailable = cacheWithdrawable;

    if (amount > trueAvailable) {
      // Diagnostic log — record the drift between strict and cache so the CFO
      // Reconcile tab can pick it up.
      console.error("[wallet-deduction] rejected", {
        user_id: target_user_id,
        requested: amount,
        true_available: trueAvailable,
        cache_withdrawable: cacheWithdrawable,
        cache_float: cacheFloat,
      });
      if (cacheWithdrawable > trueAvailable) {
        try {
          await adminClient.from('wallet_overdraw_events').insert({
            user_id: target_user_id,
            attempted_amount: amount,
            available_amount: trueAvailable,
            context: {
              source: 'wallet-deduction',
              cache_withdrawable: cacheWithdrawable,
              cache_float: cacheFloat,
              actor_id: user.id,
            },
          });
        } catch (_) { /* diagnostic only */ }
      }
      return new Response(
        JSON.stringify({
          error: `Maximum deductible from wallet: UGX ${trueAvailable.toLocaleString()} (requested UGX ${amount.toLocaleString()}). Float (UGX ${cacheFloat.toLocaleString()}) is company liability and cannot be deducted from this tool.`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Defensive live recheck against the wallet bucket immediately before
    // posting. This prevents stale UI submissions without reintroducing the
    // strict-ledger blocker that Finance asked to bypass for retractions.
    const { data: freshWallet } = await adminClient
      .from('wallets')
      .select('withdrawable_balance')
      .eq('user_id', target_user_id)
      .single();
    const liveAvailable = Math.max(0, Number(freshWallet?.withdrawable_balance ?? 0));
    if (liveAvailable < amount) {
      return new Response(
        JSON.stringify({
          error: `Wallet balance changed: now UGX ${liveAvailable.toLocaleString()}. Refresh and try again.`,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Single wallet deduction. No float spill — ever.
    const withdrawablePortion = amount;
    const floatPortion = 0;

    // Get target user profile for audit
    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("full_name, phone")
      .eq("id", target_user_id)
      .single();

    const targetName = targetProfile?.full_name || "Unknown";

    // Build balanced ledger entries. If the withdrawable bucket can't cover
    // the full amount, split: wallet_deduction (withdrawable) + float_retraction (float).
    const nowIso = new Date().toISOString();
    const entries: any[] = [];

    const ledgerCategory = isRetraction
      ? 'wallet_deduction_cash_payout_retraction'
      : 'wallet_deduction_general_adjustment';
    if (withdrawablePortion > 0) {
      entries.push({
        user_id: target_user_id,
        amount: withdrawablePortion,
        direction: 'cash_out',
        category: ledgerCategory,
        ledger_scope: 'wallet',
        description: `Wallet deduction (${safeCategory}): ${reason}`,
        currency: 'UGX',
        source_table: 'wallet_deductions',
        linked_party: user.id,
        transaction_date: nowIso,
        recipient_type: 'user',
      });
      entries.push({
        direction: 'cash_in',
        amount: withdrawablePortion,
        category: ledgerCategory,
        ledger_scope: 'platform',
        description: `Platform receives deduction (${safeCategory}): ${reason}`,
        currency: 'UGX',
        source_table: 'wallet_deductions',
        transaction_date: nowIso,
      });
    }

    // Float spill removed: this tool is strict-withdrawable-only. See plan
    // 2026-04-29 — float is company liability and is never deductible here.

    const { data: txnGroupId, error: ledgerErr } = await adminClient.rpc('create_ledger_transaction', {
      entries,
      idempotency_key: `wallet-deduction-${target_user_id}-${crypto.randomUUID()}`,
      // CFO wallet deductions are an authorized cache-cleanup / recovery path.
      // The live wallet bucket recheck above is the gate; bypass the
      // all-time ledger solvency guard so anchored users with negative legacy
      // ledger history can still have their current withdrawable cache removed.
      skip_balance_check: true,
    });

    if (ledgerErr) {
      console.error("Ledger RPC error:", ledgerErr);
      const rawMsg = ledgerErr.message || "Failed to record ledger entry";
      return new Response(JSON.stringify({ error: rawMsg }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ledgerEntryId = txnGroupId;

    // Record in wallet_deductions table
    const { error: deductionErr } = await adminClient.from("wallet_deductions").insert({
      target_user_id,
      deducted_by: user.id,
      amount,
      category: safeCategory,
      reason: reason.trim(),
      ledger_entry_id: ledgerEntryId,
    });

    if (deductionErr) {
      console.error("Deduction record error:", deductionErr);
      // Ledger entry already exists, log but don't fail
    }

    // Audit log
    await adminClient.from("audit_logs").insert({
      user_id: user.id,
      action_type: "wallet_deduction",
      table_name: "wallets",
      record_id: target_user_id,
      metadata: {
        amount,
        category: safeCategory,
        reason: reason.trim(),
        target_user_name: targetName,
        ledger_entry_id: ledgerEntryId,
        txn_group_id: txnGroupId,
        previous_balance: wallet.balance,
        new_balance: wallet.balance - amount,
        withdrawable_portion: withdrawablePortion,
        float_portion: floatPortion,
      },
    });

    // Push notification to target user (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({
        userIds: [target_user_id],
        payload: { title: "💸 Wallet Deduction", body: `UGX ${amount.toLocaleString()} deducted from your wallet`, url: "/dashboard/tenant", type: "success" },
      }),
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        deducted: amount,
        previous_balance: wallet.balance,
        new_balance: wallet.balance - amount,
        target_user: targetName,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Wallet deduction error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
