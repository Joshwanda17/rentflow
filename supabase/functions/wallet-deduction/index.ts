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

    // CFO/FinOps deductions pull whatever is currently visible on the wallet,
    // regardless of bucket. The UI shows the combined deductible figure
    // (withdrawable + float) and the operator deducts that amount; we then
    // split the posting across buckets.
    const isRetraction = safeCategory === 'cash_payout_retraction';
    const trueAvailable = cacheWithdrawable + cacheFloat;

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
          error: `Maximum deductible from wallet: UGX ${trueAvailable.toLocaleString()} (requested UGX ${amount.toLocaleString()}). Withdrawable UGX ${cacheWithdrawable.toLocaleString()} + Float UGX ${cacheFloat.toLocaleString()}.`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Defensive live recheck against the wallet buckets immediately before
    // posting (prevents stale UI submissions).
    const { data: freshWallet } = await adminClient
      .from('wallets')
      .select('withdrawable_balance, float_balance')
      .eq('user_id', target_user_id)
      .single();
    const liveWithdrawable = Math.max(0, Number(freshWallet?.withdrawable_balance ?? 0));
    const liveFloat = Math.max(0, Number(freshWallet?.float_balance ?? 0));
    const liveAvailable = liveWithdrawable + liveFloat;
    if (liveAvailable < amount) {
      return new Response(
        JSON.stringify({
          error: `Wallet balance changed: now UGX ${liveAvailable.toLocaleString()}. Refresh and try again.`,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Take from withdrawable first, then spill into float bucket.
    const withdrawablePortion = Math.min(amount, liveWithdrawable);
    const floatPortion = Math.max(0, amount - withdrawablePortion);

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

    if (floatPortion > 0) {
      entries.push({
        user_id: target_user_id,
        amount: floatPortion,
        direction: 'cash_out',
        category: ledgerCategory,
        ledger_scope: 'wallet',
        description: `Float bucket deduction (${safeCategory}): ${reason}`,
        currency: 'UGX',
        source_table: 'wallet_deductions',
        linked_party: user.id,
        transaction_date: nowIso,
        recipient_type: 'operational_wallet',
      });
      entries.push({
        direction: 'cash_in',
        amount: floatPortion,
        category: ledgerCategory,
        ledger_scope: 'platform',
        description: `Platform receives float deduction (${safeCategory}): ${reason}`,
        currency: 'UGX',
        source_table: 'wallet_deductions',
        transaction_date: nowIso,
      });
    }

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
