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
    const guardBlock = await checkTreasuryGuard(adminClient, "debit", req.headers.get("Authorization"));
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

    // ── Pivot guard (Phase 1): block if wallet cache disagrees with the
    // independently-computed pivot beyond threshold. Outgoing-only check.
    {
      const { data: pivotCheck, error: pivotErr } = await adminClient.rpc(
        'validate_wallet_against_pivot',
        { p_user_id: target_user_id },
      );
      if (pivotErr) {
        console.error('[wallet-deduction] pivot validate failed', pivotErr);
      } else if (pivotCheck && (pivotCheck as { ok?: boolean }).ok === false) {
        // Safe self-heal: pull wallet TOWARD pivot (never beyond), then re-check.
        console.warn('[wallet-deduction] pivot mismatch — attempting self-heal', pivotCheck);
        await adminClient.rpc('reconcile_wallet_from_pivot', { p_user_id: target_user_id });
        const { data: recheck } = await adminClient.rpc(
          'validate_wallet_against_pivot',
          { p_user_id: target_user_id },
        );
        if (recheck && (recheck as { ok?: boolean }).ok === false) {
          console.error('[wallet-deduction] BALANCE_MISMATCH after self-heal', recheck);
          return new Response(
            JSON.stringify({ error: 'BALANCE_MISMATCH', detail: recheck }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      }
    }

    // CFO/FinOps deductions can only pull ledger-backed withdrawable funds.
    // Float is company money owed to the user, so it is shown separately in
    // the UI but never counted as deductible.
    const isRetraction = safeCategory === 'cash_payout_retraction';
    const { data: strictAvailableData, error: strictAvailableErr } = await adminClient.rpc(
      'get_user_available_balance',
      { p_user_id: target_user_id },
    );
    if (strictAvailableErr) {
      console.error('[wallet-deduction] strict balance RPC failed', strictAvailableErr);
      return new Response(JSON.stringify({ error: 'Could not verify withdrawable balance' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const trueAvailable = Math.max(0, Number(strictAvailableData ?? 0));

    if (amount > trueAvailable) {
      console.error("[wallet-deduction] rejected", {
        user_id: target_user_id,
        requested: amount,
        true_available: trueAvailable,
        cache_withdrawable: cacheWithdrawable,
        cache_float: cacheFloat,
      });
      return new Response(
        JSON.stringify({
          error: `Maximum withdrawable deductible: UGX ${trueAvailable.toLocaleString()} (requested UGX ${amount.toLocaleString()}). Float UGX ${cacheFloat.toLocaleString()} is excluded.`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Defensive live recheck immediately before posting (prevents stale UI submissions).
    const { data: liveAvailableData, error: liveAvailableErr } = await adminClient.rpc(
      'get_user_available_balance',
      { p_user_id: target_user_id },
    );
    if (liveAvailableErr) {
      console.error('[wallet-deduction] live strict balance RPC failed', liveAvailableErr);
      return new Response(JSON.stringify({ error: 'Could not re-check withdrawable balance' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const liveAvailable = Math.max(0, Number(liveAvailableData ?? 0));
    if (liveAvailable < amount) {
      return new Response(
        JSON.stringify({
          error: `Withdrawable balance changed: now UGX ${liveAvailable.toLocaleString()}. Refresh and try again.`,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get target user profile for audit
    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("full_name, phone")
      .eq("id", target_user_id)
      .single();

    const targetName = targetProfile?.full_name || "Unknown";

    // Pre-flight cache reseed: if cached withdrawable is below the strict
    // (ledger-backed) figure, the apply_wallet_movement trigger will try to
    // debit a too-small cache and fail wallets_balance_check. Lift the cache
    // up to the strict number first so the trigger can deduct cleanly.
    // Strict has already gated the request, so this never inflates beyond
    // what the user is actually entitled to.
    if (cacheWithdrawable < liveAvailable) {
      const reseedTarget = liveAvailable;
      const newBalance = reseedTarget + cacheFloat + Math.max(0, Number(wallet.advance_balance ?? 0));
      const { error: reseedErr } = await adminClient.rpc('admin_reseed_wallet_cache', {
        p_user_id: target_user_id,
        p_withdrawable: reseedTarget,
        p_balance: newBalance,
      });
      if (reseedErr) {
        console.error('[wallet-deduction] cache reseed failed', reseedErr);
        return new Response(
          JSON.stringify({ error: `Could not reseed wallet cache before deduction: ${reseedErr.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Build balanced ledger entries against withdrawable only.
    const nowIso = new Date().toISOString();
    const entries: any[] = [];
    const withdrawablePortion = amount;
    const floatPortion = 0;

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

    const { data: txnGroupId, error: ledgerErr } = await adminClient.rpc('create_ledger_transaction', {
      entries,
      idempotency_key: `wallet-deduction-${target_user_id}-${crypto.randomUUID()}`,
      // CFO wallet deductions are gated by get_user_available_balance above.
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
