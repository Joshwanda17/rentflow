import { createClient } from "npm:@supabase/supabase-js@2";
import { runShadowAudit } from "../_shared/shadowLogger.ts";
import { shadowValidateCfoAdjustment } from "../_shared/shadowValidation.ts";
import { fetchShadowConfig, shouldSample } from "../_shared/shadowConfig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  // Fetch shadow config once (cached 60s)
  const shadowConfig = await fetchShadowConfig(adminClient);

  try {
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      console.error("Missing or invalid Authorization header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    // Use admin client to verify the JWT token
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) {
      console.error("Auth verification failed:", authError?.message || "No user");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["cfo", "manager", "super_admin"]);

    if (!roles?.length) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { target_user_id, amount, reason, operation, wallet_category, platform_category, financial_impact, category_label, sub_category } = await req.json();
    const op = operation === "debit" ? "debit" : "credit";
    const callerRoles = (roles || []).map((r: any) => r.role);

    // Allowed production categories
    const ALLOWED_CATEGORIES = [
      'roi_wallet_credit', 'roi_expense', 'agent_commission_earned',
      'system_balance_correction', 'wallet_transfer', 'wallet_deduction',
      'access_fee_collected', 'registration_fee_collected',
    ];
    const walletCat = ALLOWED_CATEGORIES.includes(wallet_category) ? wallet_category : 'system_balance_correction';
    const platformCat = ALLOWED_CATEGORIES.includes(platform_category) ? platform_category : 'system_balance_correction';
    const impact = ['revenue', 'expense', 'neutral'].includes(financial_impact) ? financial_impact : 'neutral';

    // Validate inputs — shadow on failure paths
    if (!target_user_id || typeof target_user_id !== "string") {
      if (shouldSample(shadowConfig)) {
        runShadowAudit('cfo-direct-credit', { target_user_id, amount, operation }, false,
          () => shadowValidateCfoAdjustment({ targetUserId: target_user_id, amount, reason, operation: op, callerRoles }), adminClient);
      }
      throw new Error("Invalid target user");
    }
    if (!amount || typeof amount !== "number" || amount <= 0 || amount > 50000000) {
      if (shouldSample(shadowConfig)) {
        runShadowAudit('cfo-direct-credit', { target_user_id, amount, operation }, false,
          () => shadowValidateCfoAdjustment({ targetUserId: target_user_id, amount, reason, operation: op, callerRoles }), adminClient);
      }
      throw new Error("Invalid amount (1 - 50,000,000)");
    }
    if (!reason || typeof reason !== "string" || reason.length < 10) {
      if (shouldSample(shadowConfig)) {
        runShadowAudit('cfo-direct-credit', { target_user_id, amount, reason, operation }, false,
          () => shadowValidateCfoAdjustment({ targetUserId: target_user_id, amount, reason, operation: op, callerRoles }), adminClient);
      }
      throw new Error("Reason must be at least 10 characters");
    }

    // Phase 5: Shadow audit on success path — sampled
    if (shouldSample(shadowConfig)) {
      runShadowAudit('cfo-direct-credit', { target_user_id, amount, operation },
        true, () => shadowValidateCfoAdjustment({ targetUserId: target_user_id, amount, reason, operation: op, callerRoles }), adminClient);
    }

    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("id, full_name")
      .eq("id", target_user_id)
      .single();

    if (!targetProfile) throw new Error("Target user not found");

    // Ensure wallet exists
    const { data: existingWallet } = await adminClient
      .from("wallets")
      .select("id, balance")
      .eq("user_id", target_user_id)
      .single();

    if (!existingWallet) {
      await adminClient.from("wallets").insert({ user_id: target_user_id, balance: 0 });
    }

    // CFO has authority to debit regardless of balance (corrections, clawbacks)
    // Log a warning if balance is insufficient for audit trail
    if (op === "debit") {
      const bal = existingWallet?.balance ?? 0;
      if (bal < amount) {
        console.warn(`[cfo-direct-credit] CFO debit exceeds balance: user=${target_user_id} balance=${bal} debit=${amount}`);
      }
    }

    const groupId = crypto.randomUUID();

    if (op === "credit") {
      console.log("[cfo-direct-credit] Creating CREDIT ledger entries for", target_user_id, "amount:", amount);
      const { error: rpcErr } = await adminClient.rpc('create_ledger_transaction', {
        entries: [
          {
            user_id: target_user_id,
            amount,
            direction: 'cash_in',
            category: walletCat,
            ledger_scope: 'wallet',
            source_table: 'cfo_direct_credit',
            description: `Welile Technologies Finance [${category_label || walletCat}]${sub_category ? ' → ' + sub_category : ''}: ${reason}`,
            currency: 'UGX',
            transaction_date: new Date().toISOString(),
          },
          {
            user_id: userId,
            direction: 'cash_out',
            amount,
            category: platformCat,
            ledger_scope: 'platform',
            source_table: 'cfo_direct_credit',
            description: `Welile Technologies Finance → ${targetProfile.full_name} [${impact}]: ${reason}`,
            currency: 'UGX',
            transaction_date: new Date().toISOString(),
          },
        ],
        skip_balance_check: true,
      });
      if (rpcErr) {
        console.error("[cfo-direct-credit] Credit ledger error:", rpcErr.message);
        throw new Error(`Ledger error: ${rpcErr.message}`);
      }
    } else {
      console.log("[cfo-direct-credit] Creating DEBIT ledger entries for", target_user_id, "amount:", amount);
      const { error: rpcErr } = await adminClient.rpc('create_ledger_transaction', {
        entries: [
          {
            user_id: target_user_id,
            amount,
            direction: 'cash_out',
            category: walletCat,
            ledger_scope: 'wallet',
            source_table: 'cfo_direct_credit',
            description: `CFO Debit [${category_label || walletCat}]: ${reason}`,
            currency: 'UGX',
            transaction_date: new Date().toISOString(),
          },
          {
            user_id: userId,
            direction: 'cash_in',
            amount,
            category: platformCat,
            ledger_scope: 'platform',
            source_table: 'cfo_direct_credit',
            description: `${targetProfile.full_name} → Platform [${impact}]: ${reason}`,
            currency: 'UGX',
            transaction_date: new Date().toISOString(),
          },
        ],
        skip_balance_check: true,
      });
      if (rpcErr) {
        console.error("[cfo-direct-credit] Debit ledger error:", rpcErr.message);
        throw new Error(`Ledger error: ${rpcErr.message}`);
      }
    }

    // Audit log
    await adminClient.from("audit_logs").insert({
      user_id: user.id,
      action_type: `cfo_direct_${op}`,
      table_name: "general_ledger",
      record_id: groupId,
      metadata: {
        target_user_id,
        target_name: targetProfile.full_name,
        amount,
        reason,
        operation: op,
        wallet_category: walletCat,
        platform_category: platformCat,
        financial_impact: impact,
        category_label: category_label || walletCat,
        sub_category: sub_category || null,
      },
    });

    const verb = op === "credit" ? "credited to" : "debited from";

    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ title: "💳 Welile Technologies Finance", body: "Activity: wallet credit", url: "/manager" }),
    }).catch(() => {});

    // Push notification to target user (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({
        userIds: [target_user_id],
        payload: { title: op === "credit" ? "💰 Welile Technologies Finance" : "💸 Wallet Debited", body: `UGX ${amount.toLocaleString()} ${verb} your wallet by Welile Technologies Finance`, url: "/dashboard", type: "success" },
      }),
    }).catch(() => {});


    return new Response(JSON.stringify({
      success: true,
      message: `UGX ${amount.toLocaleString()} ${verb} ${targetProfile.full_name}`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[cfo-direct-credit] Error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
