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

    const cacheWithdrawable = Number(wallet.withdrawable_balance ?? 0);
    const cacheFloat = Number(wallet.float_balance ?? 0);

    // ── STRICT WITHDRAWABLE GATE (matches the UI cap) ───────────────────────
    // The CFO panel shows "Withdrawable" via get_user_available_balance, which
    // floors the cached bucket by the user's ledger-net position and pending
    // holds. We MUST gate on the same number — never the raw cache, and never
    // float (float is company liability and is NEVER deductible from this tool).
    const { data: strictData, error: strictErr } = await adminClient.rpc(
      'get_user_available_balance',
      { p_user_id: target_user_id },
    );
    if (strictErr) {
      console.error("[wallet-deduction] strict RPC failed:", strictErr.message);
      return new Response(JSON.stringify({ error: `Could not verify withdrawable balance: ${strictErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const strictAvailable = Number(strictData ?? 0);

    // get_user_available_balance is the authoritative CFO cap. It already
    // handles anchored wallet baselines, pending holds, and the withdrawable
    // bucket. Do NOT add a second raw all-time ledger cap here: older users can
    // have negative historical ledger positions while still having a valid
    // anchored withdrawable balance that Finance must be allowed to sweep.
    // RETRACTION OVERRIDE: cash_payout_retraction reverses a payout that the
    // user actually received but is being clawed back. The strict RPC may
    // under-report (anchored cache > ledger net), so for retractions we cap
    // against the cached withdrawable bucket instead. All other categories
    // remain strict-gated.
    const isRetraction = safeCategory === 'cash_payout_retraction';
    const trueAvailable = isRetraction
      ? Math.max(0, cacheWithdrawable)
      : Math.max(0, strictAvailable);

    if (amount > trueAvailable) {
      // Diagnostic log — record the drift between strict and cache so the CFO
      // Reconcile tab can pick it up.
      console.error("[wallet-deduction] rejected", {
        user_id: target_user_id,
        requested: amount,
        strict_available: strictAvailable,
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
              strict_rpc: strictAvailable,
              actor_id: user.id,
            },
          });
        } catch (_) { /* diagnostic only */ }
      }
      return new Response(
        JSON.stringify({
          error: `Maximum deductible: UGX ${trueAvailable.toLocaleString()} (requested UGX ${amount.toLocaleString()}). Cached withdrawable shows UGX ${cacheWithdrawable.toLocaleString()}. Float (UGX ${cacheFloat.toLocaleString()}) is company liability and cannot be deducted from this tool.`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Defensive recheck against the STRICT available balance (not the raw
    // cache). The cache can lag the ledger after the Wallet Ledger Anchor
    // posts its balanced pair; using the cache here causes spurious 409s on
    // legitimate retractions. The strict RPC is the single source of truth.
    let liveAvailable: number;
    if (isRetraction) {
      const { data: freshWallet } = await adminClient
        .from('wallets')
        .select('withdrawable_balance')
        .eq('user_id', target_user_id)
        .single();
      liveAvailable = Math.max(0, Number(freshWallet?.withdrawable_balance ?? 0));
    } else {
      const { data: strictNow } = await adminClient.rpc(
        "get_user_available_balance",
        { p_user_id: target_user_id },
      );
      liveAvailable = Number(strictNow ?? 0);
    }
    if (liveAvailable < amount) {
      return new Response(
        JSON.stringify({
          error: `Available balance changed: now UGX ${liveAvailable.toLocaleString()}. Refresh and try again.`,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Single, withdrawable-only deduction. No float spill — ever.
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

    if (withdrawablePortion > 0) {
      entries.push({
        user_id: target_user_id,
        amount: withdrawablePortion,
        direction: 'cash_out',
        category: 'wallet_deduction',
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
        category: 'wallet_deduction',
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
      // The strict RPC + live bucket recheck above is the gate; bypass the
      // all-time ledger solvency guard so anchored users with negative legacy
      // ledger history can still have their current withdrawable cache removed.
      skip_balance_check: true,
    });

    if (ledgerErr) {
      console.error("Ledger RPC error:", ledgerErr);
      const rawMsg = ledgerErr.message || "Failed to record ledger entry";
      // Friendlier message for the most common case
      const friendly = /Insufficient ledger balance/i.test(rawMsg)
        ? (() => {
            const m = rawMsg.match(/Available:\s*(\d+(?:\.\d+)?),\s*Required:\s*(\d+(?:\.\d+)?)/i);
            if (m) {
              const avail = Number(m[1]).toLocaleString();
              const req = Number(m[2]).toLocaleString();
              return `Insufficient ledger balance. Available: UGX ${avail}, Required: UGX ${req}. The wallet shows UGX ${Number(wallet.balance).toLocaleString()} but the user's net ledger position is lower (likely due to outstanding debt or pending obligations).`;
            }
            return rawMsg;
          })()
        : rawMsg;
      return new Response(JSON.stringify({ error: friendly }), {
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
